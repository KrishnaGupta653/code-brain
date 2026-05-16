/**
 * GitHub API Adapter
 * Handles authentication and repository fetching
 */

export interface GitHubRepo {
  owner: string;
  repo: string;
}

export class GitHubAPI {
  private token: string | null = null;
  private baseUrl = 'https://api.github.com';
  private defaultBranchCache = new Map<string, string>();

  setToken(token: string | null) {
    this.token = token;
  }

  /**
   * Parse GitHub URL or owner/repo format
   */
  parseRepoUrl(url: string): GitHubRepo | null {
    if (!url || typeof url !== 'string') return null;
    
    url = url.trim();
    if (url.length > 200) return null;

    // Try: https://github.com/owner/repo
    const match = url.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, '')
      };
    }

    // Try: owner/repo
    const simple = url.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
    if (simple) {
      return {
        owner: simple[1],
        repo: simple[2]
      };
    }

    return null;
  }

  /**
   * Get GitHub API rate limit
   */
  async getRateLimit(): Promise<{ limit: number; remaining: number; reset: number }> {
    const headers = this.getHeaders();
    try {
      const response = await fetch(`${this.baseUrl}/rate_limit`, { headers });
      
      if (!response.ok) {
        return { limit: 60, remaining: 60, reset: Math.floor(Date.now() / 1000) + 3600 };
      }

      const data = await response.json() as any;
      const core = data.resources?.core || {};
      return {
        limit: core.limit || 60,
        remaining: core.remaining || 60,
        reset: core.reset || Math.floor(Date.now() / 1000) + 3600
      };
    } catch {
      return { limit: 60, remaining: 60, reset: Math.floor(Date.now() / 1000) + 3600 };
    }
  }

  /**
   * Fetch repository tree (files and directories)
   */
  async fetchTree(
    owner: string,
    repo: string,
    recursive: boolean = true
  ): Promise<any[]> {
    const headers = this.getHeaders();
    const ref = await this.getDefaultBranch(owner, repo);
    const url = `${this.baseUrl}/repos/${owner}/${repo}/git/trees/${ref}?recursive=${recursive ? 1 : 0}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const message = await this.readGitHubError(response);
      throw new Error(`Failed to fetch repository tree (${response.status}): ${message}`);
    }

    const data = await response.json() as any;
    return data.tree || [];
  }

  /**
   * Fetch file contents
   */
  async fetchFile(
    owner: string,
    repo: string,
    path: string
  ): Promise<string> {
    const headers = this.getHeaders();
    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${path}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const message = await this.readGitHubError(response);
      throw new Error(`Failed to fetch ${path} (${response.status}): ${message}`);
    }

    const data = await response.json() as any;
    
    if (data.encoding === 'base64') {
      const binary = atob(String(data.content || '').replace(/\s/g, ''));
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }

    return data.content || '';
  }

  /**
   * Scan repository for code files
   */
  async scanRepository(
    owner: string,
    repo: string,
    excludePatterns: string[] = [],
    onProgress?: (message: string) => void
  ): Promise<Array<{ path: string; name: string }>> {
    onProgress?.('Fetching repository tree...');

    const tree = await this.fetchTree(owner, repo, true);
    const files: Array<{ path: string; name: string }> = [];

    // Filter for code files
    for (const item of tree) {
      if (item.type === 'blob') {
        const path = item.path;
        
        // Skip excluded patterns
        if (this.shouldExclude(path, excludePatterns)) continue;

        // Skip binary files
        if (this.isBinary(path)) continue;

        files.push({
          path,
          name: path.split('/').pop() || path
        });
      }
    }

    onProgress?.(`Found ${files.length} code files`);
    return files;
  }

  /**
   * Fetch multiple files in parallel
   */
  async fetchFiles(
    owner: string,
    repo: string,
    files: Array<{ path: string; name: string }>,
    onProgress?: (current: number, total: number) => void
  ): Promise<Array<{ path: string; name: string; content: string }>> {
    const results: Array<{ path: string; name: string; content: string }> = [];
    const batchSize = 10; // Parallel requests

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const promises = batch.map(file =>
        this.fetchFile(owner, repo, file.path)
          .then(content => ({
            path: file.path,
            name: file.name,
            content
          }))
          .catch(() => ({
            path: file.path,
            name: file.name,
            content: ''
          }))
      );

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
      onProgress?.(Math.min(i + batchSize, files.length), files.length);
    }

    return results;
  }

  /**
   * Get authorization headers
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'code-brain'
    };

    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    return headers;
  }

  private async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const key = `${owner}/${repo}`.toLowerCase();
    const cached = this.defaultBranchCache.get(key);
    if (cached) return cached;

    const response = await fetch(`${this.baseUrl}/repos/${owner}/${repo}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const message = await this.readGitHubError(response);
      throw new Error(`Failed to access repository (${response.status}): ${message}`);
    }

    const data = await response.json() as { default_branch?: string };
    const branch = data.default_branch || 'main';
    this.defaultBranchCache.set(key, branch);
    return branch;
  }

  private async readGitHubError(response: Response): Promise<string> {
    try {
      const body = await response.json() as { message?: string };
      return body.message || response.statusText || 'GitHub request failed';
    } catch {
      return response.statusText || 'GitHub request failed';
    }
  }

  /**
   * Check if file should be excluded
   */
  private shouldExclude(path: string, patterns: string[]): boolean {
    const ignore = new Set([
      'node_modules', '.git', 'dist', 'build', 'coverage',
      '__pycache__', '.next', '.venv', 'venv', '.github',
      '.gitlab', '.gitignore', '.env', '.env.local'
    ]);

    const parts = path.split('/');
    for (const part of parts) {
      if (ignore.has(part)) return true;
    }

    // Check patterns
    for (const pattern of patterns) {
      if (path.includes(pattern)) return true;
    }

    return false;
  }

  /**
   * Check if file is binary
   */
  private isBinary(path: string): boolean {
    const binaryExts = [
      '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
      '.zip', '.tar', '.gz', '.exe', '.dll', '.so',
      '.mp3', '.mp4', '.wav', '.avi', '.mov', '.pdf',
      '.woff', '.woff2', '.ttf', '.otf'
    ];

    const lower = path.toLowerCase();
    return binaryExts.some(ext => lower.endsWith(ext));
  }
}

export const github = new GitHubAPI();
