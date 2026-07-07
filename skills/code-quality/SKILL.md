---
name: code-quality
description: Use when writing, reviewing, or refactoring code to ensure high quality, maintainability, and best practices. Apply to any programming language.
---

# Code Quality Skill

## Core Principles

### 1. Single Responsibility Principle (SRP)
Each function, class, or module should do ONE thing well.

```typescript
// BAD: Does too many things
function processUser(user: User) {
  validateEmail(user.email);
  saveToDatabase(user);
  sendWelcomeEmail(user.email);
  logAction('user_created');
}

// GOOD: Each function has one responsibility
function validateUserEmail(email: string): boolean { ... }
function persistUser(user: User): void { ... }
function notifyUserWelcome(email: string): Promise<void> { ... }
function logUserCreation(): void { ... }
```

### 2. DRY (Don't Repeat Yourself)
Extract common patterns into reusable functions.

```typescript
// BAD: Repetition
const users = data.filter(u => u.active && u.age > 18);
const admins = data.filter(u => u.active && u.role === 'admin');

// GOOD: Extract predicate
const isActiveAdult = (u: User) => u.active && u.age > 18;
const isAdmin = (u: User) => u.active && u.role === 'admin';
const users = data.filter(isActiveAdult);
const admins = data.filter(isAdmin);
```

### 3. KISS (Keep It Simple, Stupid)
Prefer clarity over cleverness.

```typescript
// BAD: Clever but unclear
const result = arr.reduce((a, b) => a + b, 0) / arr.length;

// GOOD: Clear and readable
const sum = arr.reduce((accumulator, current) => accumulator + current, 0);
const average = sum / arr.length;
```

### 4. YAGNI (You Aren't Gonna Need It)
Don't add features until they're actually needed.

### 5. Fail Fast & Handle Errors
```typescript
// Always validate inputs
function divide(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero');
  return a / b;
}

// Use typed errors
class ValidationError extends Error {
  constructor(field: string, message: string) {
    super(`Validation failed for ${field}: ${message}`);
    this.name = 'ValidationError';
  }
}
```

### 6. Immutability
```typescript
// BAD: Mutates
const addItem = (list: Item[], item: Item) => {
  list.push(item);
  return list;
};

// GOOD: Returns new array
const addItem = (list: Item[], item: Item): Item[] => {
  return [...list, item];
};

// Use readonly types
interface Config {
  readonly apiUrl: string;
  readonly timeout: number;
}
```

### 7. Composition Over Inheritance
```typescript
// BAD: Deep inheritance
class Animal { ... }
class Dog extends Animal { ... }
class GuideDog extends Dog { ... }

// GOOD: Compose behaviors
const withBarking = (entity: Doglike) => ({
  bark: () => console.log('Woof!'),
  ...entity
});

const withGuidance = (entity: Guidelike) => ({
  guide: (direction: Direction) => { ... },
  ...entity
});

const guideDog = withBarking(withGuidance({ name: 'Rex' }));
```

## Naming Conventions

### Variables & Functions (camelCase / snake_case)
```typescript
// JavaScript/TypeScript
const userName = 'John';
const isActive = true;
const getUserById = (id: string) => { ... };

// Python
user_name = 'john'
is_active = True
def get_user_by_id(user_id: str) -> User: ...
```

### Classes & Types (PascalCase)
```typescript
class UserAccount { ... }
interface ApiResponse { ... }
type UserRole = 'admin' | 'user';
```

### Constants (UPPER_SNAKE_CASE)
```typescript
const MAX_RETRY_COUNT = 3;
const API_BASE_URL = 'https://api.example.com';
```

### Files
- Web: `user-profile.ts`, `api-client.ts`
- React: `UserProfile.tsx`, `ApiClient.ts`
- Python: `user_profile.py`, `api_client.py`

## Code Structure

### File Organization
```typescript
// 1. Imports
import { useState } from 'react';
import { User } from '../types';
import { fetchUser } from '../api';

// 2. Constants
const DEFAULT_AVATAR = '/avatar.png';

// 3. Types/Interfaces
interface UserCardProps {
  userId: string;
}

// 4. Component/Function
export function UserCard({ userId }: UserCardProps) {
  // 5. Hooks/State
  const [user, setUser] = useState<User | null>(null);

  // 6. Effects
  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);

  // 7. Handlers
  const handleClick = () => { ... };

  // 8. Render/Return
  return <div>{user?.name}</div>;
}
```

### Function Guidelines
- Max 20-30 lines
- Max 3-4 parameters (use objects for more)
- Early returns for guard clauses
- One clear purpose

```typescript
// BAD: Long, nested, unclear
function processData(data: any, config: any, callback: any) {
  if (data) {
    if (config.enabled) {
      for (const item of data) {
        if (item.valid) {
          // 50 more lines...
        }
      }
    }
  }
}

// GOOD: Short, clear, early returns
function processData(data: DataItem[], config: Config): ProcessedItem[] {
  if (!data?.length) return [];
  if (!config.enabled) return [];
  
  return data
    .filter(isValidItem)
    .map(processItem);
}
```

## Error Handling Patterns

### Try-Catch with Context
```typescript
async function loadUser(userId: string): Promise<User> {
  try {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`Failed to load user ${userId}: ${error.message}`);
  }
}
```

### Result Pattern (No Exceptions)
```typescript
type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

async function tryLoadUser(id: string): Promise<Result<User>> {
  try {
    const user = await loadUser(id);
    return { ok: true, value: user };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}
```

## Documentation

### When to Document
- **WHY**: Explain reasoning, trade-offs, constraints
- **WHAT**: Complex algorithms, business rules
- **NOT**: What the code does (code should be self-explanatory)

```typescript
// BAD: Restates code
// Increment counter by 1
counter++;

// GOOD: Explains why
// Rate limit requires 1-minute cooldown between retries
// to avoid triggering anti-abuse systems
counter++;
```

## Checklist

Before submitting code:
- [ ] Functions do one thing
- [ ] No code duplication
- [ ] Clear, descriptive names
- [ ] Error handling present
- [ ] Edge cases considered
- [ ] Types are correct
- [ ] No magic numbers
- [ ] Comments explain WHY
- [ ] File size reasonable
- [ ] No unused imports/variables
