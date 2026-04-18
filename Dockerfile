# Backend Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

EXPOSE 8000

# Allow connecting to host.docker.internal for Chrome
ENV CHROME_USER_DATA_DIR=/chrome-data
ENV CHROME_PROFILE_DIR=Default

CMD ["uvicorn", "browser_use_example:app", "--host", "0.0.0.0", "--port", "8000"]
