#!/bin/bash
# Run the app locally for development
set -e

echo "=== AWS Academy Lab & Assessment Generator — Local Dev ==="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "Edit .env with your credentials before running."
    exit 1
fi

# Load .env
export $(grep -v '^#' .env | xargs)

# Start backend
echo "[1/2] Starting backend (FastAPI on port 8000)..."
cd backend
pip install -r requirements.txt -q
uvicorn app:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

echo "   Backend running at http://localhost:8000"
echo ""

# Start frontend
echo "[2/2] Starting frontend (React on port 3000)..."
cd frontend
npm install --silent 2>/dev/null
REACT_APP_API_URL=http://localhost:8000 npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "   Frontend running at http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Handle cleanup
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
