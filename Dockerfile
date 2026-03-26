FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code (data is indexed on startup)
COPY backend/ backend/

# Expose port
ENV PORT=8888
EXPOSE 8888

# Start server
CMD python -m uvicorn backend.api:app --host 0.0.0.0 --port ${PORT}
