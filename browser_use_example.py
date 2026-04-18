
# Refactored: Generic API for ecommerce order automation
import asyncio
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from browser_use import Agent, BrowserSession, BrowserProfile, ChatOpenAI

app = FastAPI()

class OrderRequest(BaseModel):
    url: str
    task: str  # e.g., "order", "add_to_cart", etc.
    delivery_address: str = None
    payment_method: str = None
    extra: dict = None

def get_browser_session():
    # Use environment variables for Chrome user data/profile
    chrome_user_data_dir = os.environ.get("CHROME_USER_DATA_DIR", "/home/thiago/.config/google-chrome")
    chrome_profile_dir = os.environ.get("CHROME_PROFILE_DIR", "Default")
    # Use host's Chrome, not inside Docker
    return BrowserSession(
        browser_profile=BrowserProfile(
            channel="chrome",
            user_data_dir=chrome_user_data_dir,
            profile_dir=chrome_profile_dir,
            connect_existing=True,  # Try to connect to host browser
        )
    )

def get_llm():
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    return ChatOpenAI(
        model=os.environ.get("LLM_MODEL", "openai/gpt-4o"),
        base_url=os.environ.get("LLM_BASE_URL", "https://openrouter.ai/api/v1"),
        api_key=api_key,
    )

@app.post("/order")
async def perform_order(req: OrderRequest):
    browser = get_browser_session()
    llm = get_llm()
    # Compose a generic task prompt
    task_prompt = f"Perform the following action: {req.task} on {req.url}."
    if req.delivery_address:
        task_prompt += f" Delivery address: {req.delivery_address}."
    if req.payment_method:
        task_prompt += f" Payment method: {req.payment_method}."
    if req.extra:
        task_prompt += f" Extra: {req.extra}."
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
    return {"result": result}
