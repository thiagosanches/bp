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
    model: str = "google/gemini-2.5-flash-lite"
    browser_address: str = "http://127.0.0.1:9222"


class URLItem(BaseModel):
    url: str
    model: str = "google/gemini-2.5-flash-lite"
    prompt: str = "Perform the task on the given URL"
    browser_address: str = "http://127.0.0.1:9222"


def get_llm(model: str = None):
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY not set")

    # Priority: parameter > env var > default
    selected_model = model or os.environ.get(
        "LLM_MODEL", "google/gemini-2.5-flash-lite")

    return ChatOpenAI(
        model=selected_model,
        base_url=os.environ.get(
            "LLM_BASE_URL", "https://openrouter.ai/api/v1"),
        api_key=api_key,
    )


async def check_browser_health(browser: Browser) -> bool:
    """Check if browser connection is alive"""
    try:
        # Try to get browser info via CDP
        cdp_url = browser.cdp_url if hasattr(browser, 'cdp_url') else os.environ.get(
            "CDP_URL", "http://127.0.0.1:9222")

        if not cdp_url or cdp_url == "http://":
            logger.warning("Invalid CDP URL for health check")
            return False

        import aiohttp

        # Test CDP connection by hitting /json/version
        test_url = cdp_url.rstrip('/') + '/json/version'
        async with aiohttp.ClientSession() as session:
            async with session.get(test_url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status == 200:
                    return True
        return False
    except (aiohttp.ClientError, asyncio.TimeoutError) as e:
        logger.warning(f"Browser health check failed - connection error: {e}")
        return False
    except Exception as e:
        logger.warning(f"Browser health check failed: {e}")
        return False


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

    logger.info(
        f"[{task_id}] Starting order: {payload}")

    task_prompt = f"{payload.task}. Link: {payload.url}"
    max_retries = 2
    retry_count = 0

    while retry_count <= max_retries:
        try:
            browser = Browser(
                cdp_url=payload.browser_address or "http://127.0.0.1:9222")
            llm = get_llm(model=payload.model)

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
            break  # Success, exit retry loop

        except Exception as e:
            retry_count += 1
            error_msg = str(e)

            # Check if it's a browser connection error
            is_browser_error = any(keyword in error_msg.lower() for keyword in
                                   ['connection', 'cdp', 'websocket', 'timeout', 'refused'])

            if is_browser_error and retry_count <= max_retries:
                logger.warning(
                    f"[{task_id}] Browser error (attempt {retry_count}/{max_retries}): {e}")

                # Exponential backoff: 2s, 4s
                await asyncio.sleep(2 ** retry_count)
                continue

            # Final failure
            logger.error(
                f"[{task_id}] Failed after {retry_count} attempts: {e}", exc_info=True)
            tasks_status[task_id]["status"] = TaskStatus.FAILED
            tasks_status[task_id]["error"] = error_msg
            tasks_status[task_id]["retry_count"] = retry_count
            tasks_status[task_id]["completed_at"] = datetime.utcnow().isoformat()
            raise


async def periodic_health_check():
    """Periodic browser health check"""
    global _browser

    while True:
        await asyncio.sleep(60)  # Check every 60 seconds
        try:
            if _browser is not None:
                is_healthy = await check_browser_health(_browser)
                if not is_healthy:
                    logger.warning(
                        "Periodic health check failed, marking browser for reconnection")
                    async with _browser_lock:
                        try:
                            await _browser.stop()
                        except Exception as stop_error:
                            logger.warning(
                                f"Error stopping browser: {stop_error}")
                        _browser = None
        except Exception as e:
            logger.error(f"Periodic health check error: {e}")


@app.on_event("startup")
async def startup_event():
    """Start background task queue worker and health checks"""
    asyncio.create_task(process_task_queue())
    asyncio.create_task(periodic_health_check())
    logger.info("Application started")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    global _browser
    if _browser:
        logger.info("Closing browser instance")
        try:
            await _browser.stop()
            logger.info("Browser stopped successfully")
        except Exception as e:
            logger.warning(f"Error stopping browser on shutdown: {e}")
    logger.info("Application shutdown")


@app.post("/order")
async def order(payload: OrderRequest):
    task_id = str(uuid.uuid4())
    tasks_status[task_id] = {
        "id": task_id,
        "status": TaskStatus.QUEUED,
        "url": payload.url,
        "task": payload.task,
        "model": payload.model,
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


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "ok",
        "queue_size": task_queue.qsize(),
        "active_tasks": len([t for t in tasks_status.values() if t["status"] == TaskStatus.RUNNING]),
        "total_tasks": len(tasks_status)
    }


# URL management endpoints
@app.get("/urls")
async def get_urls():
    return urls_storage


@app.post("/urls")
async def add_url(item: URLItem):
    logger.info(f"URL received: {item}")
    url_obj = {
        "url": item.url,
        "model": item.model,
        "prompt": item.prompt,
        "browser_address": item.browser_address,
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
        browser_address=url_item.get("browser_address", "http://"),
        task=url_item["prompt"],
        model=url_item.get("model", "google/gemini-2.5-flash-lite")
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
