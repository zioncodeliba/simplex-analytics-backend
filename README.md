# Express TypeScript REST API Template

Production-ready Express.js REST API template with TypeScript, featuring comprehensive code quality tools, automated testing, Docker containerization, and CI/CD pipeline integration.

## Features

- **Express.js** - Fast, unopinionated web framework
- **TypeScript** - Type safety and modern JavaScript features
- **ES Modules** - Modern module system
- **Code Quality Tools**
  - ESLint with strict configuration
  - Prettier for code formatting
  - Husky for git hooks
  - Commitlint for conventional commits
  - SonarQube integration
- **Testing** - Jest with Supertest for API testing
- **Security**
  - Helmet for security headers
  - CORS configuration
  - Rate limiting
  - Input validation
- **Logging** - Winston logger with multiple transports
- **Docker** - Multi-stage Dockerfile for production
- **CI/CD** - GitLab CI pipeline with automated deployment
- **API Documentation** - Ready for Swagger/OpenAPI integration

## Project Structure

```
node-express/
├── src/
│   ├── config/           # Configuration files
│   ├── controllers/      # Request handlers
│   ├── middlewares/      # Express middlewares
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── utils/            # Utility functions
│   ├── types/            # TypeScript type definitions
│   ├── app.ts            # Express app configuration
│   └── index.ts          # Application entry point
├── tests/                # Test files
├── docker/               # Docker configuration
├── .husky/               # Git hooks
└── logs/                 # Application logs
```

## Prerequisites

- Node.js 22+ or Bun
- npm/yarn/pnpm/bun
- Docker (optional, for containerization)
- Git

## Getting Started

### 1. Installation

```bash
# Install dependencies
npm install

# or
yarn install

# or
pnpm install

# or
bun install
```

### 2. Environment Configuration

Copy the example environment file and configure your variables:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
NODE_ENV=development
PORT=3000
API_URL=http://localhost:3000
CORS_ORIGIN=*
```

### 3. Development

```bash
# Start development server with hot reload
npm run dev

# The API will be available at http://localhost:3000
```

### 4. Building

```bash
# Build the TypeScript code
npm run build

# Start production server
npm start
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build TypeScript to JavaScript |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors automatically |
| `npm run format` | Format code with Prettier |
| `npm run type-check` | Check TypeScript types |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Generate test coverage report |
| `npm run validate` | Run all checks (type-check, lint, format, build) |
| `npm run sonar` | Run SonarQube analysis |
| `npm run cz` | Commit with Commitizen |

## API Endpoints

### Health Check

```
GET /health
```

Returns server health status.

### Example Endpoints

```
GET    /api/examples       # Get all examples
GET    /api/examples/:id   # Get example by ID
POST   /api/examples       # Create new example
PUT    /api/examples/:id   # Update example
DELETE /api/examples/:id   # Delete example
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Docker

### Build and Run with Docker

```bash
# Build Docker image
docker build -t node-express-api .

# Run container
docker run -p 3000:3000 node-express-api
```

### Using Docker Compose

```bash
# Development
docker-compose up

# Staging
docker-compose -f docker-compose.stag.yml up

# Production
docker-compose -f docker-compose.prod.yml up
```

### Using Makefile

```bash
# Show available commands
make help

# Start development
make dev

# Build and start with Docker
make build
make start

# View logs
make logs

# Stop containers
make stop
```

## Code Quality

### Git Hooks

This project uses Husky to enforce code quality:

- **pre-commit**: Runs lint-staged (formats and lints changed files)
- **commit-msg**: Validates commit message format
- **pre-push**: Runs type-check, lint, format check, and build

### Commit Message Format

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <subject>

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
```

Example:
```bash
git commit -m "feat: add user authentication endpoint"
```

Or use Commitizen:
```bash
npm run cz
```

## CI/CD

The project includes a GitLab CI/CD pipeline with:

1. **Test Stage**: SonarQube code quality analysis
2. **Build Stage**: Docker image build and push
3. **Deploy Stage**: Automated deployment to staging/production

### Required GitLab CI/CD Variables

- `DOCKER_USERNAME` - Docker Hub username
- `DOCKER_PASSWORD` - Docker Hub password
- `SSH_PRIVATE_KEY` - SSH key for deployment
- `STAGING_SERVER` - Staging server address
- `STAGING_USER` - Staging server user
- `STAGING_PATH` - Staging deployment path
- `PRODUCTION_SERVER` - Production server address
- `PRODUCTION_USER` - Production server user
- `PRODUCTION_PATH` - Production deployment path

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | `development` |
| `PORT` | Server port | `3000` |
| `API_URL` | API base URL | `http://localhost:3000` |
| `CORS_ORIGIN` | CORS allowed origins | `*` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in ms | `900000` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |
| `LOG_LEVEL` | Logging level | `info` |

## Best Practices

1. **Keep controllers thin** - Move business logic to services
2. **Use TypeScript strictly** - Enable all strict compiler options
3. **Handle errors properly** - Use the AppError class for operational errors
4. **Validate input** - Use express-validator for request validation
5. **Log appropriately** - Use structured logging with Winston
6. **Test thoroughly** - Aim for >80% code coverage
7. **Document APIs** - Consider adding Swagger/OpenAPI documentation
8. **Secure your API** - Use helmet, rate limiting, and input validation

## Adding New Features

### 1. Create a new route

```typescript
// src/routes/user.routes.ts
import { Router } from 'express'
import { getUsers, createUser } from '../controllers/user.controller.js'

const router = Router()

router.get('/', getUsers)
router.post('/', createUser)

export default router
```

### 2. Create a controller

```typescript
// src/controllers/user.controller.ts
import { Request, Response, NextFunction } from 'express'

export const getUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Your logic here
    res.status(200).json({ success: true, data: [] })
  } catch (error) {
    next(error)
  }
}
```

### 3. Register the route

```typescript
// src/routes/index.ts
import userRoutes from './user.routes.js'

router.use('/users', userRoutes)
```

## Troubleshooting

### Port already in use

```bash
# Find and kill the process using port 3000
lsof -ti:3000 | xargs kill -9
```

### Module not found errors

```bash
# Clean and reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### TypeScript errors

```bash
# Run type check to see all errors
npm run type-check
```

## License

ISC

## Author

WebVoltz

---

Built with ❤️ using Express.js and TypeScript
