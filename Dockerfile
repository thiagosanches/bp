# Backend Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml poetry.lock* ./
RUN python -m pip install --no-cache-dir build
RUN python -m build -w -o /tmp/dist
RUN pip install --no-cache-dir /tmp/dist/*.whl
COPY . .

EXPOSE 8000
CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8000"]
