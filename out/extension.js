"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
function activate(context) {
    const disposable = vscode.commands.registerCommand('surferH.runFeedback', async () => {
        const config = vscode.workspace.getConfiguration();
        const repoPath = config.get('surferH.repoPath') || '';
        const command = config.get('surferH.command') || 'bash ./run-on-holo.sh';
        const modelName = config.get('surferH.modelName') || '';
        const modelUrl = config.get('surferH.modelUrl') || '';
        const haiKey = config.get('surferH.haiApiKey') || '';
        const taskTemplate = config.get('surferH.defaultTask') || '';
        const feedbackRel = config.get('surferH.feedbackFile') || 'feedback.md';
        if (!repoPath) {
            vscode.window.showErrorMessage('surferH.repoPath is not set. Please configure it in Settings.');
            return;
        }
        const port = await vscode.window.showInputBox({
            prompt: 'Enter your localhost port (e.g., 3000, 5173, 8080)',
            placeHolder: '3000',
            validateInput: (val) => (/^\d{2,5}$/.test(val) ? undefined : 'Enter a valid port number'),
        });
        if (!port)
            return;
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
            }
            else if (!hasFocusSection) {
                task += `\n\nFocus specifically on: ${trimmedFocus}.`;
            }
        }
        else if (hasFocusPlaceholder) {
            task = task.split('{{FOCUS}}').join('');
        }
        const output = vscode.window.createOutputChannel('Surfer-H');
        output.show(true);
        const cwd = repoPath;
        const env = { ...process.env };
        if (haiKey)
            env['HAI_API_KEY'] = haiKey;
        if (modelName)
            env['HAI_MODEL_NAME'] = modelName;
        if (modelUrl)
            env['HAI_MODEL_URL'] = modelUrl;
        env['TASK'] = task;
        env['TARGET_URL'] = url;
        output.appendLine(`[Surfer-H] CWD: ${cwd}`);
        output.appendLine(`[Surfer-H] Command: ${command}`);
        output.appendLine(`[Surfer-H] TARGET_URL: ${url}`);
        const child = (0, child_process_1.spawn)(command, {
            cwd,
            env,
            shell: true,
        });
        let buffer = '';
        let captured = '';
        let inBlock = false;
        let rawLog = '';
        const MAX_LOG_CHARS = 100000;
        const appendLog = (chunk) => {
            rawLog += chunk;
            if (rawLog.length > MAX_LOG_CHARS) {
                rawLog = rawLog.slice(-MAX_LOG_CHARS);
            }
        };
        const startMarker = '=== FEEDBACK START ===';
        const endMarker = '=== FEEDBACK END ===';
        child.stdout.on('data', (data) => {
            const text = data.toString();
            output.append(text);
            appendLog(text);
            buffer += text;
            let lineStart = 0;
            while (true) {
                const idxNewline = buffer.indexOf('\n', lineStart);
                if (idxNewline === -1)
                    break;
                const line = buffer.slice(lineStart, idxNewline);
                if (line.includes(startMarker))
                    inBlock = true;
                else if (line.includes(endMarker))
                    inBlock = false;
                else if (inBlock)
                    captured += line + '\n';
                lineStart = idxNewline + 1;
            }
            buffer = buffer.slice(lineStart);
        });
        child.stderr.on('data', (data) => {
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
            let feedbackPath;
            if (workspaceFolder) {
                feedbackPath = path.join(workspaceFolder, feedbackRel);
            }
            else {
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
            }
            catch (e) {
                vscode.window.showErrorMessage(`Could not write feedback: ${e.message}`);
            }
        });
    });
    context.subscriptions.push(disposable);
}
function fallbackMarkdown(stdoutTail) {
    const cleaned = stripAnsi(stdoutTail);
    const lines = cleaned.split(/\r?\n/).map((line) => line.trimEnd());
    let answer = '';
    const answerIdx = lines.findIndex((line) => /Answer\s*:/.test(line));
    if (answerIdx !== -1) {
        const collected = [];
        const first = lines[answerIdx];
        const firstContent = first.slice(first.indexOf(':') + 1).trim();
        if (firstContent)
            collected.push(firstContent);
        for (let i = answerIdx + 1; i < lines.length; i++) {
            const nextLine = lines[i];
            if (/^\[Surfer-H]/.test(nextLine))
                break;
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
function stripAnsi(input) {
    const ansiRegex = /[\u001B\u009B][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;
    return input.replace(ansiRegex, '');
}
function deactivate() { }
//# sourceMappingURL=extension.js.map