# Use the latest Python 3 image
# User requested 3.14, using 3.13 (or latest 3) as 3.14 is future/alpha
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies if any (none for now)

# Copy requirements
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose port (Cloud Run sets PORT env var, but 8080 is default)
EXPOSE 8080

# Run the server
CMD ["python", "main.py"]
