import { simpleGit, SimpleGit, LogResult } from 'simple-git';
import { logger } from '../utils/index.js';

export interface GitFileStats {
  path: string;
  changeCount: number;
  lastModified: Date;
  authors: string[];
  isHotspot: boolean;
}

export interface GitBlameInfo {
  author: string;
  date: Date;
  commit: string;
  line: number;
}

export class GitIntegration {
  private git: SimpleGit;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.git = simpleGit(projectRoot);
  }

  /**
   * Check if the project is a git repository
   */
  async isGitRepo(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file change statistics for hotspot detection
   */
  async getFileStats(filePaths: string[], since?: string): Promise<Map<string, GitFileStats>> {
    const stats = new Map<string, GitFileStats>();

    try {
      const options = since ? ['--since', since] : [];
      const log: LogResult = await this.git.log([...options, '--name-only', '--pretty=format:%H|%an|%ad']);

      const fileChanges = new Map<string, { count: number; authors: Set<string>; lastDate: Date }>();

      for (const commit of log.all) {
        const parts = commit.hash.split('|');
        if (parts.length < 3) continue;

        const author = parts[1];
        const date = new Date(parts[2]);

        // Get files changed in this commit
        const diffSummary = await this.git.diffSummary([`${commit.hash}^`, commit.hash]);
        
        for (const file of diffSummary.files) {
          if (!filePaths.includes(file.file)) continue;

          const existing = fileChanges.get(file.file) || {
            count: 0,
            authors: new Set<string>(),
            lastDate: new Date(0),
          };

          existing.count++;
          existing.authors.add(author);
          if (date > existing.lastDate) {
            existing.lastDate = date;
          }

          fileChanges.set(file.file, existing);
        }
      }

      // Calculate hotspots (files with > 10 changes or > 3 authors)
      const changeCounts = Array.from(fileChanges.values()).map(s => s.count);
      const avgChanges = changeCounts.reduce((a, b) => a + b, 0) / changeCounts.length || 0;
      const threshold = Math.max(10, avgChanges * 1.5);

      for (const [path, data] of fileChanges) {
        stats.set(path, {
          path,
          changeCount: data.count,
          lastModified: data.lastDate,
          authors: Array.from(data.authors),
          isHotspot: data.count > threshold || data.authors.size > 3,
        });
      }

      logger.debug(`Analyzed git history for ${stats.size} files`);
    } catch (error) {
      logger.warn('Failed to get git file stats', error);
    }

    return stats;
  }

  /**
   * Get blame information for a specific file
   */
  async getBlame(filePath: string): Promise<GitBlameInfo[]> {
    try {
      const blame = await this.git.raw(['blame', '--line-porcelain', filePath]);
      const lines: GitBlameInfo[] = [];
      const blameLines = blame.split('\n');

      let currentCommit = '';
      let currentAuthor = '';
      let currentDate = new Date();
      let lineNumber = 0;

      for (const line of blameLines) {
        if (line.match(/^[0-9a-f]{40}/)) {
          currentCommit = line.split(' ')[0];
        } else if (line.startsWith('author ')) {
          currentAuthor = line.substring(7);
        } else if (line.startsWith('author-time ')) {
          const timestamp = parseInt(line.substring(12), 10);
          currentDate = new Date(timestamp * 1000);
        } else if (line.startsWith('\t')) {
          lineNumber++;
          lines.push({
            author: currentAuthor,
            date: currentDate,
            commit: currentCommit,
            line: lineNumber,
          });
        }
      }

      return lines;
    } catch (error) {
      logger.warn(`Failed to get blame for ${filePath}`, error);
      return [];
    }
  }

  /**
   * Get recent commits for a file
   */
  async getFileHistory(filePath: string, limit: number = 10): Promise<Array<{
    commit: string;
    author: string;
    date: Date;
    message: string;
  }>> {
    try {
      const log = await this.git.log({ file: filePath, maxCount: limit });
      return log.all.map(commit => ({
        commit: commit.hash,
        author: commit.author_name,
        date: new Date(commit.date),
        message: commit.message,
      }));
    } catch (error) {
      logger.warn(`Failed to get history for ${filePath}`, error);
      return [];
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const status = await this.git.status();
      return status.current || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get repository remote URL
   */
  async getRemoteUrl(): Promise<string | null> {
    try {
      const remotes = await this.git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');
      return origin?.refs.fetch || null;
    } catch {
      return null;
    }
  }
}
