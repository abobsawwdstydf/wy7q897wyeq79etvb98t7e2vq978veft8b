declare global {
  namespace Express {
    interface Request {
      userId?: string;
      isAdmin?: boolean;
      adminToken?: string;
      user?: { id: string };
      fakeMode?: boolean;
    }
  }
}

export {};
