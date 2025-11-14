import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('surferH.runFeedback', async () => {
    const config = vscode.workspace.getConfiguration();
    const repoPath = config.get<string>('surferH.repoPath') || '';
    const command = config.get<string>('surferH.command') || 'bash ./run-on-holo.sh';
    const modelName = config.get<string>('surferH.modelName') || '';
    const modelUrl = config.get<string>('surferH.modelUrl') || '';
    const haiKey = config.get<string>('surferH.haiApiKey') || '';
    const taskTemplate = config.get<string>('surferH.defaultTask') || '';
    const feedbackRel = config.get<string>('surferH.feedbackFile') || 'feedback.md';

    if (!repoPath) {
      vscode.window.showErrorMessage('surferH.repoPath is not set. Please configure it in Settings.');
      return;
    }

    const port = await vscode.window.showInputBox({
      prompt: 'Enter your localhost port (e.g., 3000, 5173, 8080)',
      placeHolder: '3000',
      validateInput: (val) => (/^\d{2,5}$/.test(val) ? undefined : 'Enter a valid port number'),
    });
    if (!port) return;

    const focusInput = await vscode.window.showInputBox({
      prompt: 'Optional: What should Surfer-H focus on?',
      placeHolder: 'Examples: checkout flow, onboarding, specific bug, etc.',
    });

    const url = `http://localhost:${port}`;
    const trimmedFocus = focusInput?.trim();
    const focusClause = trimmedFocus ? `Primary focus: ${trimmedFocus}.` : '';
    const template = taskTemplate || '';
    const hasFocusPlaceholder = template.includes('{{FOCUS}}');
    const hasFocusSection = template.includes('{{FOCUS_SECTION}}');
    let task = template.split('{{URL}}').join(url);
    task = task.split('{{FOCUS_SECTION}}').join(focusClause);

    if (trimmedFocus) {
      if (hasFocusPlaceholder) {
        task = task.split('{{FOCUS}}').join(trimmedFocus);
      } else if (!hasFocusSection) {
        task += `\n\nFocus specifically on: ${trimmedFocus}.`;
      }
    } else if (hasFocusPlaceholder) {
      task = task.split('{{FOCUS}}').join('');
    }

    const output = vscode.window.createOutputChannel('Surfer-H');
    output.show(true);

    const cwd = repoPath;
    const env = { ...process.env } as NodeJS.ProcessEnv;
    if (haiKey) env['HAI_API_KEY'] = haiKey;
    if (modelName) env['HAI_MODEL_NAME'] = modelName;
    if (modelUrl) env['HAI_MODEL_URL'] = modelUrl;
    env['TASK'] = task;
    env['TARGET_URL'] = url;

    output.appendLine(`[Surfer-H] CWD: ${cwd}`);
    output.appendLine(`[Surfer-H] Command: ${command}`);
    output.appendLine(`[Surfer-H] TARGET_URL: ${url}`);

    const child = spawn(command, {
      cwd,
      env,
      shell: true,
    });

    let buffer = '';
    let captured = '';
    let inBlock = false;
    let rawLog = '';
    const MAX_LOG_CHARS = 100_000;

    const appendLog = (chunk: string) => {
      rawLog += chunk;
      if (rawLog.length > MAX_LOG_CHARS) {
        rawLog = rawLog.slice(-MAX_LOG_CHARS);
      }
    };

    const startMarker = '=== FEEDBACK START ===';
    const endMarker = '=== FEEDBACK END ===';

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      output.append(text);
      appendLog(text);
      buffer += text;

      let lineStart = 0;
      while (true) {
        const idxNewline = buffer.indexOf('\n', lineStart);
        if (idxNewline === -1) break;
        const line = buffer.slice(lineStart, idxNewline);
        if (line.includes(startMarker)) inBlock = true;
        else if (line.includes(endMarker)) inBlock = false;
        else if (inBlock) captured += line + '\n';
        lineStart = idxNewline + 1;
      }
      buffer = buffer.slice(lineStart);
    });

    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      output.append(text);
      appendLog(text);
    });

    child.on('error', (err) => {
      vscode.window.showErrorMessage(`Failed to start Surfer-H: ${err.message}`);
    });

    child.on('close', async (code) => {
      output.appendLine(`\n[Surfer-H] Process exited with code ${code}`);
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

      let feedbackPath: string;
      if (workspaceFolder) {
        feedbackPath = path.join(workspaceFolder, feedbackRel);
      } else {
        const defaultDir = os.homedir() || process.cwd();
        const defaultName = path.basename(feedbackRel) || 'feedback.md';
        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(path.join(defaultDir, defaultName)),
          saveLabel: 'Save Surfer-H feedback',
        });
        if (!saveUri) {
          vscode.window.showWarningMessage('Surfer-H feedback not saved because no location was selected.');
          return;
        }
        feedbackPath = saveUri.fsPath;
      }

      const finalMd = captured.trim() || fallbackMarkdown(rawLog || buffer);
      try {
        fs.mkdirSync(path.dirname(feedbackPath), { recursive: true });
        fs.writeFileSync(feedbackPath, finalMd, 'utf8');
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(feedbackPath));
        await vscode.window.showTextDocument(doc);
        const displayPath = workspaceFolder ? feedbackRel : feedbackPath;
        vscode.window.showInformationMessage(`Surfer-H feedback saved to ${displayPath}`);
      } catch (e: any) {
        vscode.window.showErrorMessage(`Could not write feedback: ${e.message}`);
      }
    });
  });

  context.subscriptions.push(disposable);
}

function fallbackMarkdown(stdoutTail: string): string {
  const cleaned = stripAnsi(stdoutTail);
  const lines = cleaned.split(/\r?\n/).map((line) => line.trimEnd());

  let answer = '';
  const answerIdx = lines.findIndex((line) => /Answer\s*:/.test(line));
  if (answerIdx !== -1) {
    const collected: string[] = [];
    const first = lines[answerIdx];
    const firstContent = first.slice(first.indexOf(':') + 1).trim();
    if (firstContent) collected.push(firstContent);
    for (let i = answerIdx + 1; i < lines.length; i++) {
      const nextLine = lines[i];
      if (/^\[Surfer-H]/.test(nextLine)) break;
      collected.push(nextLine);
    }
    answer = collected.join('\n').trim();
  }

  if (answer) {
    return answer;
  }

  const header = `# Surfer-H Feedback (Raw Capture)\n\n_No delimited block found; showing a raw slice of output._\n\n`;
  const slice = lines.slice(-500).join('\n');
  return header + '``````\n' + slice + '\n' + '``````\n';
}

function stripAnsi(input: string): string {
  const ansiRegex =
    /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;
  return input.replace(ansiRegex, '');
}

export function deactivate() {}
