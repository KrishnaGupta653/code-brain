import * as vscode from 'vscode';

let serverUrl = 'http://localhost:3000';
let statusBarItem: vscode.StatusBarItem;

// Decoration types
const deadCodeDecoration = vscode.window.createTextEditorDecorationType({
  opacity: '0.45',
  fontStyle: 'italic',
  after: {
    contentText: ' ← dead code',
    color: new vscode.ThemeColor('codeBrain.deadCode'),
    fontSize: '11px',
    margin: '0 0 0 1em'
  }
});

const bridgeDecoration = vscode.window.createTextEditorDecorationType({
  border: '1px solid',
  borderColor: new vscode.ThemeColor('codeBrain.bridgeNode'),
  borderRadius: '3px',
  after: {
    contentText: ' ⚠ bridge',
    color: new vscode.ThemeColor('codeBrain.bridgeNode'),
    fontSize: '11px',
    margin: '0 0 0 1em'
  }
});

interface NodeData {
  id: string;
  name: string;
  type: string;
  fullName?: string;
  importance?: number;
  rank?: { score: number };
  incomingCount?: number;
  outgoingCount?: number;
  location?: {
    file: string;
    startLine: number;
    endLine: number;
  };
  metadata?: {
    isDead?: boolean;
    isBridge?: boolean;
    isExported?: boolean;
  };
}

interface ImpactAnalysis {
  target: { id: string; name: string };
  blastRadius: number;
  explanation: string;
  directImpact: NodeData[];
  transitiveImpact: NodeData[];
  affectedTests: NodeData[];
  affectedFiles: string[];
}

/**
 * Code lens provider: shows "⚡ importance: 87% | 23 callers" above each function
 */
class ImportanceLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const config = vscode.workspace.getConfiguration('codeBrain');
    if (!config.get('showImportanceLens')) {
      return [];
    }

    try {
      const fileName = document.uri.fsPath.split('/').pop() || '';
      const url = `${serverUrl}/api/search?q=${encodeURIComponent(fileName)}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!res.ok) return [];
      
      const nodes: NodeData[] = await res.json();

      return nodes
        .filter(n => 
          n.location?.startLine && 
          ['function', 'method', 'class', 'interface'].includes(n.type) &&
          n.location.file.endsWith(fileName)
        )
        .map(n => {
          const line = (n.location!.startLine ?? 1) - 1;
          const range = new vscode.Range(line, 0, line, 0);
          const imp = ((n.rank?.score ?? n.importance ?? 0) * 100).toFixed(0);
          const callers = n.incomingCount ?? 0;
          const isDead = n.metadata?.isDead;
          
          let label: string;
          let command: string;
          
          if (isDead) {
            label = `🪦 dead code — 0 callers`;
            command = 'codeBrain.showDeadCode';
          } else {
            label = `⚡ importance: ${imp}% · ${callers} caller${callers !== 1 ? 's' : ''}`;
            command = 'codeBrain.analyzeImpact';
          }
          
          return new vscode.CodeLens(range, {
            title: label,
            command: command,
            arguments: [n.name, n.id],
          });
        });
    } catch (error) {
      // Silently fail if server is not running
      return [];
    }
  }
}

/**
 * Hover provider: shows detailed info when hovering a symbol
 */
class ImpactHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Hover | null> {
    const wordRange = document.getWordRangeAtPosition(
      position,
      /[a-zA-Z_$][a-zA-Z0-9_$]*/
    );
    
    if (!wordRange) return null;
    
    const word = document.getText(wordRange);
    if (word.length < 3) return null;

    try {
      const url = `${serverUrl}/api/query/impact-full?target=${encodeURIComponent(word)}&depth=2`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!res.ok) return null;
      
      const data: ImpactAnalysis = await res.json();

      const md = new vscode.MarkdownString();
      md.isTrusted = true;
      md.supportHtml = true;
      
      md.appendMarkdown(`### 🧠 code-brain: \`${word}\`\n\n`);
      
      // Blast radius with color coding
      const blastPercent = (data.blastRadius * 100).toFixed(0);
      const blastEmoji = data.blastRadius > 0.7 ? '🔴' : data.blastRadius > 0.4 ? '🟡' : '🟢';
      md.appendMarkdown(`${blastEmoji} **Blast radius:** ${blastPercent}%\n\n`);
      
      md.appendMarkdown(`- **Direct dependents:** ${data.directImpact?.length ?? 0}\n`);
      md.appendMarkdown(`- **Total affected:** ${data.transitiveImpact?.length ?? 0}\n`);
      md.appendMarkdown(`- **Affected tests:** ${data.affectedTests?.length ?? 0}\n`);
      
      if (data.explanation) {
        md.appendMarkdown(`\n*${data.explanation}*\n`);
      }
      
      md.appendMarkdown(`\n[Analyze Full Impact](command:codeBrain.analyzeImpact?${encodeURIComponent(JSON.stringify([word]))})`);
      
      return new vscode.Hover(md, wordRange);
    } catch (error) {
      return null;
    }
  }
}

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('code-brain extension activated');

  // Get configuration
  const config = vscode.workspace.getConfiguration('codeBrain');
  serverUrl = config.get('serverUrl') ?? serverUrl;

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = '$(graph) code-brain';
  statusBarItem.tooltip = 'Click to open code-brain dashboard';
  statusBarItem.command = 'codeBrain.openDashboard';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Check server health
  checkServerHealth();

  // Register code lens provider
  const lensProvider = new ImportanceLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: 'file' },
      lensProvider
    )
  );

  // Register hover provider
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { scheme: 'file' },
      new ImpactHoverProvider()
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'codeBrain.analyzeImpact',
      async (name?: string, id?: string) => {
        const symbolName = name ?? await vscode.window.showInputBox({
          prompt: 'Symbol name to analyze',
          placeHolder: 'e.g., UserService, handleRequest'
        });
        
        if (!symbolName) return;

        try {
          const res = await fetch(
            `${serverUrl}/api/query/impact-full?target=${encodeURIComponent(symbolName)}`
          );
          const data: ImpactAnalysis = await res.json();

          const blastPercent = (data.blastRadius * 100).toFixed(0);
          const message = `**${symbolName}**\n\n` +
            `Blast radius: ${blastPercent}%\n` +
            `Affected nodes: ${data.transitiveImpact?.length ?? 0}\n` +
            `Affected tests: ${data.affectedTests?.length ?? 0}\n\n` +
            `${data.explanation}`;

          const action = await vscode.window.showInformationMessage(
            message,
            'Open Dashboard',
            'Show Affected Files'
          );

          if (action === 'Open Dashboard') {
            vscode.commands.executeCommand('codeBrain.openDashboard');
          } else if (action === 'Show Affected Files') {
            const files = data.affectedFiles.slice(0, 10);
            const selected = await vscode.window.showQuickPick(files, {
              placeHolder: `${data.affectedFiles.length} affected files`
            });
            if (selected) {
              const uri = vscode.Uri.file(selected);
              vscode.window.showTextDocument(uri);
            }
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to analyze impact: ${error}`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeBrain.findCallers', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selection = editor.selection;
      const word = editor.document.getText(
        editor.document.getWordRangeAtPosition(selection.active)
      );

      if (!word) {
        vscode.window.showWarningMessage('No symbol selected');
        return;
      }

      try {
        const res = await fetch(
          `${serverUrl}/api/query/callers?symbol=${encodeURIComponent(word)}`
        );
        const data = await res.json();

        if (data.count === 0) {
          vscode.window.showInformationMessage(`No callers found for ${word}`);
          return;
        }

        const items = data.callers.map((c: NodeData) => ({
          label: c.name,
          description: c.type,
          detail: c.location?.file,
          caller: c
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `${data.count} callers of ${word}`
        });

        if (selected && selected.caller.location) {
          const uri = vscode.Uri.file(selected.caller.location.file);
          const position = new vscode.Position(
            selected.caller.location.startLine - 1,
            0
          );
          vscode.window.showTextDocument(uri, {
            selection: new vscode.Range(position, position)
          });
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to find callers: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeBrain.showDeadCode', async () => {
      try {
        const res = await fetch(`${serverUrl}/api/analyze/dead-code`);
        const data = await res.json();

        if (data.total === 0) {
          vscode.window.showInformationMessage('No dead code found! 🎉');
          return;
        }

        const items = data.nodes.slice(0, 50).map((n: NodeData) => ({
          label: `$(trash) ${n.name}`,
          description: n.type,
          detail: n.file,
          node: n
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `${data.total} dead code nodes found`
        });

        if (selected && selected.node.location) {
          const uri = vscode.Uri.file(selected.node.location.file);
          const position = new vscode.Position(
            selected.node.location.startLine - 1,
            0
          );
          vscode.window.showTextDocument(uri, {
            selection: new vscode.Range(position, position)
          });
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to fetch dead code: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeBrain.checkInvariants', async () => {
      try {
        const res = await fetch(`${serverUrl}/api/analyze/invariants`);
        const data = await res.json();

        const errors = data.errors?.length ?? 0;
        const warnings = data.warnings?.length ?? 0;

        if (errors === 0 && warnings === 0) {
          vscode.window.showInformationMessage(
            '✅ All architecture invariants pass!'
          );
          return;
        }

        const message = errors > 0
          ? `⚠️ ${errors} invariant violation${errors > 1 ? 's' : ''} found`
          : `⚠️ ${warnings} warning${warnings > 1 ? 's' : ''} found`;

        const action = await vscode.window.showWarningMessage(
          message,
          'Show Details',
          'Open Dashboard'
        );

        if (action === 'Show Details') {
          const items = [
            ...(data.errors ?? []).map((e: any) => ({
              label: `$(error) ${e.message}`,
              description: e.nodeName,
              detail: e.invariant
            })),
            ...(data.warnings ?? []).map((w: any) => ({
              label: `$(warning) ${w.message}`,
              description: w.nodeName,
              detail: w.invariant
            }))
          ];

          vscode.window.showQuickPick(items, {
            placeHolder: 'Architecture invariant violations'
          });
        } else if (action === 'Open Dashboard') {
          vscode.commands.executeCommand('codeBrain.openDashboard');
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to check invariants: ${error}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeBrain.patternQuery', async () => {
      const query = await vscode.window.showInputBox({
        prompt: 'Pattern query',
        placeHolder: 'type:route no-edge:TESTS:incoming',
        value: 'type:route no-edge:TESTS:incoming'
      });

      if (!query) return;

      try {
        const params = new URLSearchParams({ limit: '20' });
        
        // Parse query string
        const parts = query.trim().split(/\s+/);
        for (const part of parts) {
          if (part.startsWith('type:')) {
            params.set('types', part.slice(5));
          } else if (part.startsWith('no-edge:')) {
            const [, t, d] = part.split(':');
            params.set('not_edge', t);
            if (d) params.set('not_edge_dir', d);
          } else if (part.startsWith('has-edge:')) {
            const [, t, d] = part.split(':');
            params.set('has_edge', t);
            if (d) params.set('has_edge_dir', d);
          } else if (part === 'dead') {
            params.set('is_dead', 'true');
          } else if (part === 'bridge') {
            params.set('is_bridge', 'true');
          } else if (part.startsWith('name:')) {
            params.set('name_pattern', part.slice(5));
          }
        }

        const res = await fetch(`${serverUrl}/api/query/pattern?${params}`);
        const data = await res.json();

        if (!data.results || data.results.length === 0) {
          vscode.window.showInformationMessage('No matches found');
          return;
        }

        const items = data.results.map((n: NodeData) => ({
          label: n.name,
          description: n.type,
          detail: n.location?.file,
          node: n
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: `${data.total} results`
        });

        if (selected && selected.node.location) {
          const uri = vscode.Uri.file(selected.node.location.file);
          const position = new vscode.Position(
            selected.node.location.startLine - 1,
            0
          );
          vscode.window.showTextDocument(uri, {
            selection: new vscode.Range(position, position)
          });
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Pattern query failed: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codeBrain.openDashboard', () => {
      vscode.env.openExternal(vscode.Uri.parse(serverUrl));
    })
  );

  // Highlight dead code in active editor
  const highlightDeadCode = async (editor: vscode.TextEditor) => {
    const config = vscode.workspace.getConfiguration('codeBrain');
    if (!config.get('highlightDeadCode')) return;

    try {
      const res = await fetch(`${serverUrl}/api/analyze/dead-code`, {
        signal: AbortSignal.timeout(2000)
      });
      const data = await res.json();

      const fileName = editor.document.uri.fsPath;
      const fileNodes: NodeData[] = (data.nodes ?? []).filter((n: NodeData) =>
        n.location?.file && fileName.endsWith(n.location.file.replace(/\\/g, '/'))
      );

      const deadRanges = fileNodes
        .filter(n => n.location?.startLine)
        .map(n => new vscode.Range(
          n.location!.startLine - 1,
          0,
          n.location!.endLine ?? n.location!.startLine,
          999
        ));

      editor.setDecorations(deadCodeDecoration, deadRanges);
    } catch {
      // Silently fail if server is not running
    }
  };

  // Highlight bridge nodes
  const highlightBridges = async (editor: vscode.TextEditor) => {
    const config = vscode.workspace.getConfiguration('codeBrain');
    if (!config.get('showBridgeWarnings')) return;

    try {
      const res = await fetch(`${serverUrl}/api/analyze/bridges`, {
        signal: AbortSignal.timeout(2000)
      });
      const data = await res.json();

      const fileName = editor.document.uri.fsPath;
      const fileNodes: NodeData[] = (data.nodes ?? []).filter((n: NodeData) =>
        n.location?.file && fileName.endsWith(n.location.file.replace(/\\/g, '/'))
      );

      const bridgeRanges = fileNodes
        .filter(n => n.location?.startLine)
        .map(n => new vscode.Range(
          n.location!.startLine - 1,
          0,
          n.location!.endLine ?? n.location!.startLine,
          999
        ));

      editor.setDecorations(bridgeDecoration, bridgeRanges);
    } catch {
      // Silently fail
    }
  };

  // Apply decorations on editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        highlightDeadCode(editor);
        highlightBridges(editor);
      }
    })
  );

  // Apply decorations to current editor
  if (vscode.window.activeTextEditor) {
    highlightDeadCode(vscode.window.activeTextEditor);
    highlightBridges(vscode.window.activeTextEditor);
  }

  // Refresh code lenses when configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('codeBrain')) {
        const config = vscode.workspace.getConfiguration('codeBrain');
        serverUrl = config.get('serverUrl') ?? serverUrl;
        lensProvider.refresh();
        checkServerHealth();
      }
    })
  );
}

/**
 * Check if code-brain server is running
 */
async function checkServerHealth() {
  try {
    const res = await fetch(`${serverUrl}/api/stats`, {
      signal: AbortSignal.timeout(2000)
    });
    
    if (res.ok) {
      const data = await res.json();
      statusBarItem.text = `$(graph) code-brain (${data.nodeCount} nodes)`;
      statusBarItem.backgroundColor = undefined;
      statusBarItem.tooltip = `code-brain server running\n${data.nodeCount} nodes, ${data.edgeCount} edges`;
    } else {
      throw new Error('Server returned error');
    }
  } catch (error) {
    statusBarItem.text = '$(graph) code-brain (offline)';
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.warningBackground'
    );
    statusBarItem.tooltip = 'code-brain server not running\nRun: code-brain serve';
  }
}

export function deactivate() {
  console.log('code-brain extension deactivated');
}
