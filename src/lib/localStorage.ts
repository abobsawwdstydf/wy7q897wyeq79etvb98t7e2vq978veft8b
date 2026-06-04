import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { encryptBuffer, decryptBuffer } from '../encrypt';

const STORAGE_ROOT = path.resolve(process.cwd(), 'storage');

interface UploadedChunk {
  chunkIndex: number;
  size: number;
  path: string;
}

interface StoredFile {
  fileId: string;
  originalName: string;
  mimeType: string;
  totalSize: number;
  encryptionLevel: number;
  chunks: UploadedChunk[];
  createdAt: string;
  userId: string;
  storagePath: string;
}

class LocalStorage {
  private initialized = false;

  constructor() {
    this.init();
  }

  /**
   * Initialize storage directories
   */
  private async init() {
    try {
      await fs.mkdir(STORAGE_ROOT, { recursive: true });
      await fs.mkdir(path.join(STORAGE_ROOT, 'files'), { recursive: true });
      await fs.mkdir(path.join(STORAGE_ROOT, 'temp'), { recursive: true });
      
      this.initialized = true;
      console.log(`\n💾 LOCAL STORAGE:`);
      console.log(`  ✓ Storage root: ${STORAGE_ROOT}`);
      console.log(`  ✓ Directories initialized`);
      console.log(`  ✓ File encryption: ENABLED`);
      console.log('');
    } catch (error: any) {
      console.error('Failed to initialize local storage:', error.message);
      throw error;
    }
  }

  /**
   * Ensure storage is initialized
   */
  private async ensureInit() {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Generate unique file ID
   */
  private generateFileId(): string {
    return `local_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Get storage path for a file
   */
  private getFilePath(fileId: string): string {
    // Organize files in subdirectories by first 2 chars of fileId for better performance
    const subdir = fileId.substring(0, 2);
    return path.join(STORAGE_ROOT, 'files', subdir, fileId);
  }

  /**
   * Upload file to local storage with encryption
   */
  async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    userId: string,
    encryptionLevel: number = 0
  ): Promise<StoredFile> {
    await this.ensureInit();

    const fileId = this.generateFileId();
    const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);
    
    console.log(`\n📦 FILE UPLOAD: ${filename}`);
    console.log(`   Size: ${fileSizeMB} MB`);
    console.log(`   MIME: ${mimeType}`);
    console.log(`   User: ${userId}`);
    console.log(`   File ID: ${fileId}`);
    console.log(`   Encryption: ENABLED`);

    const filePath = this.getFilePath(fileId);
    const fileDir = path.dirname(filePath);
    
    await fs.mkdir(fileDir, { recursive: true });
    
    // Encrypt the file buffer
    const encryptedBuffer = encryptBuffer(fileBuffer);
    await fs.writeFile(filePath, encryptedBuffer);
    
    console.log(`   ✅ Stored and encrypted: ${filePath}`);
    
    return {
      fileId,
      originalName: filename,
      mimeType,
      totalSize: fileBuffer.length,
      encryptionLevel: 1,
      chunks: [{
        chunkIndex: 0,
        size: encryptedBuffer.length,
        path: filePath,
      }],
      createdAt: new Date().toISOString(),
      userId,
      storagePath: filePath,
    };
  }

  /**
   * Download file from local storage with decryption
   */
  async downloadFile(fileId: string, chunks: UploadedChunk[]): Promise<Buffer> {
    await this.ensureInit();

    console.log(`  ⬇️ Downloading file ${fileId}...`);

    const filePath = this.getFilePath(fileId);
    try {
      const encryptedBuffer = await fs.readFile(filePath);
      console.log(`  ✅ File loaded: ${encryptedBuffer.length} bytes (encrypted)`);
      
      // Decrypt the file buffer
      const decryptedBuffer = decryptBuffer(encryptedBuffer);
      console.log(`  🔓 File decrypted: ${decryptedBuffer.length} bytes`);
      
      return decryptedBuffer;
    } catch (error: any) {
      console.error(`  ❌ Failed to read file: ${error.message}`);
      throw new Error(`File not found: ${fileId}`);
    }
  }

  /**
   * Delete file from local storage
   */
  async deleteFile(fileId: string, chunks: UploadedChunk[]): Promise<void> {
    await this.ensureInit();

    console.log(`  🗑️ Deleting file ${fileId}...`);

    const filePath = this.getFilePath(fileId);
    try {
      await fs.unlink(filePath);
      console.log(`  ✓ File deleted: ${filePath}`);
    } catch (error: any) {
      console.warn(`  ⚠️ Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    await this.ensureInit();

    try {
      const filesDir = path.join(STORAGE_ROOT, 'files');

      const getDirectorySize = async (dir: string): Promise<number> => {
        let size = 0;
        try {
          const files = await fs.readdir(dir, { withFileTypes: true, recursive: true });
          for (const file of files) {
            if (file.isFile()) {
              const filePath = path.join(file.path || dir, file.name);
              const stats = await fs.stat(filePath);
              size += stats.size;
            }
          }
        } catch {
          // Directory might not exist yet
        }
        return size;
      };

      const filesSize = await getDirectorySize(filesDir);
      const totalSizeGB = (filesSize / 1024 / 1024 / 1024).toFixed(2);

      return {
        totalSize: filesSize,
        totalSizeGB,
        filesSize,
        storageRoot: STORAGE_ROOT,
      };
    } catch (error: any) {
      console.error('Failed to get storage stats:', error.message);
      return {
        totalSize: 0,
        totalSizeGB: '0.00',
        filesSize: 0,
        storageRoot: STORAGE_ROOT,
      };
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(fileId: string, chunks: UploadedChunk[]): Promise<boolean> {
    await this.ensureInit();

    const filePath = this.getFilePath(fileId);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export const localStorage = new LocalStorage();
