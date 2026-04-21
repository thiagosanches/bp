import os
import asyncio
import logging
import uuid
from datetime import datetime
from typing import Dict, List, Optional
from enum import Enum

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi import APIRouter
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from browser_use import Agent, BrowserSession, BrowserProfile, ChatOpenAI, Browser

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()
router = APIRouter()

# Global state
_browser: Optional[Browser] = None
_browser_lock = asyncio.Lock()
task_queue: asyncio.Queue = asyncio.Queue()
tasks_status: Dict[str, dict] = {}
urls_storage: List[dict] = []


class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class OrderRequest(BaseModel):
    url: str
    task: str
    delivery_address: str = None
    payment_method: str = None
    additional_info: str = None


class URLItem(BaseModel):
    url: str


def get_llm():
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    return ChatOpenAI(
        model=os.environ.get("LLM_MODEL", "google/gemini-2.5-flash-lite"),
        base_url=os.environ.get(
            "LLM_BASE_URL", "https://openrouter.ai/api/v1"),
        api_key=api_key,
    )


async def get_browser() -> Browser:
    """Get or create persistent browser instance"""
    global _browser
    async with _browser_lock:
        if _browser is None:
            logger.info("Creating persistent browser instance")
            _browser = Browser(cdp_url=os.environ.get("CDP_URL", "http://127.0.0.1:9222"))
        return _browser


async def process_task_queue():
    """Background worker to process tasks sequentially"""
    logger.info("Task queue worker started")
    while True:
        task_id, payload = await task_queue.get()
        try:
            await perform_order(task_id, payload)
        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}", exc_info=True)
            tasks_status[task_id]["status"] = TaskStatus.FAILED
            tasks_status[task_id]["error"] = str(e)
        finally:
            task_queue.task_done()


async def perform_order(task_id: str, payload: OrderRequest):
    tasks_status[task_id]["status"] = TaskStatus.RUNNING
    tasks_status[task_id]["started_at"] = datetime.utcnow().isoformat()
    
    logger.info(f"[{task_id}] Starting order: {payload.url}")
    
    try:
        browser = await get_browser()
        llm = get_llm()

        task_prompt = f"Perform the following action: {payload.task} on {payload.url}."
        if payload.delivery_address:
            task_prompt += f" Delivery address: {payload.delivery_address}."
        if payload.payment_method:
            task_prompt += f" Payment method: {payload.payment_method}."
        if payload.additional_info:
            task_prompt += f" Additional info: {payload.additional_info}."
        
        agent = Agent(
            task=task_prompt,
            llm=llm,
            browser=browser,
        )
        
        result = await agent.run()
        
        tasks_status[task_id]["status"] = TaskStatus.COMPLETED
        tasks_status[task_id]["result"] = str(result)
        tasks_status[task_id]["completed_at"] = datetime.utcnow().isoformat()
        
        logger.info(f"[{task_id}] Completed successfully")
        
    except Exception as e:
        logger.error(f"[{task_id}] Failed: {e}", exc_info=True)
        tasks_status[task_id]["status"] = TaskStatus.FAILED
        tasks_status[task_id]["error"] = str(e)
        tasks_status[task_id]["completed_at"] = datetime.utcnow().isoformat()
        raise


@app.on_event("startup")
async def startup_event():
    """Start background task queue worker"""
    asyncio.create_task(process_task_queue())
    logger.info("Application started")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    global _browser
    if _browser:
        logger.info("Closing browser instance")
        # Don't call stop() - let external Chrome keep running
    logger.info("Application shutdown")


@app.post("/order")
async def order(payload: OrderRequest):
    task_id = str(uuid.uuid4())
    tasks_status[task_id] = {
        "id": task_id,
        "status": TaskStatus.QUEUED,
        "url": payload.url,
        "task": payload.task,
        "created_at": datetime.utcnow().isoformat()
    }
    
    await task_queue.put((task_id, payload))
    logger.info(f"Order queued: {task_id}")
    
    return {"message": "Order queued", "task_id": task_id}


@app.get("/status/{task_id}")
async def get_status(task_id: str):
    if task_id not in tasks_status:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks_status[task_id]


@app.get("/tasks")
async def list_tasks():
    return {"tasks": list(tasks_status.values())}


# URL management endpoints
@app.get("/urls")
async def get_urls():
    return urls_storage


@app.post("/urls")
async def add_url(item: URLItem):
    url_obj = {
        "url": item.url,
        "status": "ready",
        "triggerTime": None,
        "delayMinutes": None
    }
    urls_storage.append(url_obj)
    return {"success": True, "message": "URL added"}


@app.delete("/urls/{index}")
async def delete_url(index: int):
    if index < 0 or index >= len(urls_storage):
        raise HTTPException(status_code=404, detail="URL not found")
    urls_storage.pop(index)
    return {"success": True, "message": "URL removed"}


@app.post("/urls/{index}/buy")
async def buy_url(index: int):
    if index < 0 or index >= len(urls_storage):
        raise HTTPException(status_code=404, detail="URL not found")
    
    url_item = urls_storage[index]
    order = OrderRequest(
        url=url_item["url"],
        task="Complete purchase of this product"
    )
    
    task_id = str(uuid.uuid4())
    tasks_status[task_id] = {
        "id": task_id,
        "status": TaskStatus.QUEUED,
        "url": order.url,
        "task": order.task,
        "created_at": datetime.utcnow().isoformat()
    }
    
    await task_queue.put((task_id, order))
    url_item["status"] = "queued"
    
    return {"success": True, "message": "Purchase initiated", "task_id": task_id}


@app.get("/", response_class=FileResponse)
async def root():
    return FileResponse("public/index.html")

app.mount("/", StaticFiles(directory="./public"), name="static")
