import os

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi import APIRouter
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from browser_use import Agent, BrowserSession, BrowserProfile, ChatOpenAI, Browser

app = FastAPI()
router = APIRouter()


class OrderRequest(BaseModel):
    url: str
    task: str
    delivery_address: str = None
    payment_method: str = None
    additional_info: str = None


def get_llm():
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    return ChatOpenAI(
        model=os.environ.get("LLM_MODEL", "openai/gpt-4o"),
        base_url=os.environ.get(
            "LLM_BASE_URL", "https://openrouter.ai/api/v1"),
        api_key=api_key,
    )


async def perform_order(payload):
    print(f"Received order request: {payload}")
    browser = Browser(
        cdp_url="http://127.0.0.1:9222"  # Get a CDP URL from any provider
    )
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
    try:
        result = await agent.run()
    except Exception as e:
        await browser.stop()
        raise HTTPException(status_code=500, detail=str(e))
    await browser.stop()
    print(f"Finished processing order: {payload.url}")
    return {"result": result}


@app.post("/order")
async def order(payload: OrderRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(perform_order, payload)
    return {"message": "We got it! order processing started"}


@app.get("/", response_class=FileResponse)
async def root():
    return FileResponse("public/index.html")

app.mount("/", StaticFiles(directory="./public"), name="static")
