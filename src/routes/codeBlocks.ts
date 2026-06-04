import { Router } from 'express';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Code block languages supported
const SUPPORTED_LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'csharp', 'php',
  'ruby', 'go', 'rust', 'swift', 'kotlin', 'scala', 'r', 'matlab',
  'sql', 'html', 'css', 'xml', 'json', 'yaml', 'bash', 'shell',
  'dockerfile', 'makefile', 'cmake', 'gradle', 'maven'
];

// Get supported languages
router.get('/languages', (req: AuthRequest, res) => {
  res.json({ languages: SUPPORTED_LANGUAGES });
});

export default router;
