# Argumint Authentication System Setup

This document explains how to set up and run the Layer 1 authentication system for Argumint 2.0.

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas connection)
- Redis (local or cloud-based like Upstash)

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Backend
MONGODB_URI=mongodb://localhost:27017/argumint
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

# Frontend
VITE_API_BASE_URL=http://localhost:3000
```

## Project Structure

```
argumint/
├── apps/
│   ├── backend/          # Express server with authentication
│   │   ├── src/
│   │   │   ├── models/       # Database models (User)
│   │   │   ├── controllers/  # Request handlers
│   │   │   ├── services/     # Business logic
│   │   │   ├── middleware/   # Auth & rate limiting
│   │   │   ├── routes/       # API routes
│   │   │   ├── db/           # Database connections
│   │   │   ├── app.ts        # Express app setup
│   │   │   └── server.ts     # Server entry point
│   │   └── package.json
│   └── frontend/         # React/Vite app with routing
│       ├── src/
│       │   ├── contexts/     # AuthContext
│       │   ├── services/     # API client
│       │   ├── hooks/        # Custom hooks
│       │   ├── pages/        # Login, Register, Home
│       │   ├── components/   # ProtectedRoute
│       │   └── App.tsx       # Router setup
│       └── package.json
└── packages/
    └── shared/           # Shared schemas and types
        ├── src/
        │   ├── schemas/     # Zod schemas
        │   └── types/       # TypeScript types
        └── package.json
```

## Backend Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

#### MongoDB
Create a MongoDB database named `argumint`. You can use:
- Local MongoDB: `mongodb://localhost:27017/argumint`
- MongoDB Atlas: `mongodb+srv://username:password@cluster.mongodb.net/argumint`

#### Redis
Set up a Redis instance:
- Local Redis: `redis://localhost:6379`
- Upstash Redis: `redis://default:password@host:port`

### 3. Run the Backend

```bash
npm run dev --workspace=apps/backend
```

The backend will start on `http://localhost:3000`

## Frontend Setup

### 1. Environment Variables

The frontend uses `VITE_API_BASE_URL` for the API endpoint. Update the `.env` file:

```env
VITE_API_BASE_URL=http://localhost:3000
```

### 2. Run the Frontend

```bash
npm run dev --workspace=apps/frontend
```

The frontend will start on `http://localhost:5173`

## API Endpoints

### Public Routes

#### POST `/auth/register`
Register a new user.

Request:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "confirmPassword": "SecurePass123"
}
```

Response:
```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

#### POST `/auth/login`
Login with email and password.

Request:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

Response:
```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

Note: The JWT token is sent as an HTTP-only cookie automatically.

### Protected Routes

#### GET `/auth/me`
Get the current authenticated user.

Headers:
```
Cookie: authToken=<jwt_token>
```

Response:
```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

#### POST `/auth/logout`
Logout the current user.

Headers:
```
Cookie: authToken=<jwt_token>
```

Response:
```json
{
  "message": "Logged out successfully"
}
```

## Security Features

1. **Password Hashing**: Bcrypt with salt rounds of 10
2. **JWT Tokens**: Signed with a secret key (7-day expiry)
3. **HTTP-Only Cookies**: Tokens stored in secure, HTTP-only cookies
4. **Rate Limiting**: 5 login attempts per 15 minutes per IP
5. **Session Management**: Redis-backed sessions for token validation
6. **Input Validation**: Zod schemas for all inputs
7. **Email Normalization**: Emails stored in lowercase for consistency
8. **CORS**: Configured to accept requests from frontend origin

## Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

## Running the Full Stack

To run both backend and frontend concurrently:

```bash
npm run dev
```

This will start:
- Backend on `http://localhost:3000`
- Frontend on `http://localhost:5173`

## Debugging

The backend logs important events:
- Database connections
- Authentication events
- Rate limit violations

Check the console output for detailed logs during development.

## Next Steps

1. Deploy to production with proper environment variables
2. Update `JWT_SECRET` to a strong, random value
3. Set `NODE_ENV=production` in production
4. Use a managed MongoDB and Redis service (Atlas, Upstash, etc.)
5. Configure HTTPS and secure cookies in production
6. Add email verification for production deployments

## Troubleshooting

### "MongoDB connection failed"
- Ensure MongoDB is running
- Verify `MONGODB_URI` is correct
- Check network connectivity to MongoDB server

### "Redis connection failed"
- Ensure Redis is running
- Verify `REDIS_URL` is correct
- Check network connectivity to Redis server

### "Invalid token" error
- Clear browser cookies
- Ensure cookies are enabled
- Check that backend and frontend are on same domain/port combination

### CORS errors
- Verify `FRONTEND_URL` in backend matches actual frontend URL
- Check that credentials are enabled in axios requests

## References

- [Express.js Documentation](https://expressjs.com/)
- [MongoDB/Mongoose Documentation](https://mongoosejs.com/)
- [Redis/ioredis Documentation](https://github.com/luin/ioredis)
- [JWT Documentation](https://jwt.io/)
- [Zod Validation Library](https://zod.dev/)
- [React Router v7 Documentation](https://reactrouter.com/)
