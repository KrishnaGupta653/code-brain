import { Command } from "commander";
import fs from "fs";
import path from "path";
import { logger } from "../../utils/index.js";
import { getCodeBrainDir } from "../../utils/paths.js";

export function registerCleanCommand(program: Command): void {
  program
    .command("clean")
    .description("Remove .codebrain directory and all indexed data")
    .requiredOption("--path <path>", "Path to project root")
    .option("--force", "Skip confirmation prompt")
    .action(async (options: { path: string; force?: boolean }) => {
      const projectRoot = path.resolve(options.path);
      const codebrainDir = getCodeBrainDir(projectRoot);

      // Check if .codebrain directory exists
      if (!fs.existsSync(codebrainDir)) {
        logger.warn(`No .codebrain directory found at: ${codebrainDir}`);
        logger.info("Nothing to clean.");
        return;
      }

      // Get directory size for display
      const getDirectorySize = (dirPath: string): number => {
        let size = 0;
        try {
          const files = fs.readdirSync(dirPath);
          for (const file of files) {
            const filePath = path.join(dirPath, file);
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
              size += getDirectorySize(filePath);
            } else {
              size += stats.size;
            }
          }
        } catch (err) {
          // Ignore errors
        }
        return size;
      };

      const dirSize = getDirectorySize(codebrainDir);
      const sizeMB = (dirSize / (1024 * 1024)).toFixed(2);

      // Show what will be deleted
      logger.info(`Found .codebrain directory:`);
      logger.info(`  Location: ${codebrainDir}`);
      logger.info(`  Size: ${sizeMB} MB`);
      logger.info("");

      // Confirmation prompt (unless --force is used)
      if (!options.force) {
        logger.warn("⚠️  This will permanently delete all indexed data:");
        logger.warn("  - Graph database");
        logger.warn("  - Embeddings");
        logger.warn("  - Configuration");
        logger.warn("  - All backups");
        logger.info("");
        
        // In a real CLI, you'd use a prompt library like 'inquirer'
        // For now, we'll require --force flag
        logger.error("❌ Aborted. Use --force flag to confirm deletion:");
        logger.info(`   code-brain clean --path ${options.path} --force`);
        process.exit(1);
      }

      // Delete the directory
      try {
        logger.info("🗑️  Deleting .codebrain directory...");
        fs.rmSync(codebrainDir, { recursive: true, force: true });
        logger.success(`✓ Deleted ${sizeMB} MB from ${codebrainDir}`);
        logger.info("");
        logger.info("To re-index this project, run:");
        logger.info(`  code-brain init --path ${options.path}`);
        logger.info(`  code-brain index --path ${options.path}`);
      } catch (error) {
        logger.error("Failed to delete .codebrain directory:", error);
        process.exit(1);
      }
    });
}
