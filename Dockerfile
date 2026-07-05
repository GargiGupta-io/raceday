FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code and prebuilt race index for fast cold starts
COPY backend/ backend/
COPY data/ data/

# Expose port
ENV PORT=8888
EXPOSE 8888

# Start server
CMD ["python", "-c", "import os; import uvicorn; uvicorn.run('backend.api:app', host='0.0.0.0', port=int(os.environ.get('PORT', 8888)))"]
