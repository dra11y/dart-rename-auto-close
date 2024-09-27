import * as vscode from 'vscode'

/// https://github.com/Dart-Code/Dart-Code/blob/master/src/extension/commands/refactor.ts#L176
/// private async getRenameEdits...
/// L205: const document = await vs.workspace.openTextDocument

const PACKAGE_ID = 'dart-rename-auto-close'
const PACKAGE_NAME = 'Dart Rename Auto-Close'
const ACTION_KEY = 'action'

enum Action {
	AutoSaveAndClose = 'autoSaveAndClose',
	AutoSave = 'autoSave',
	Disabled = 'disabled'
}

const getActionSetting = (): Action =>
	vscode.workspace.getConfiguration(PACKAGE_ID).get<Action>(ACTION_KEY, Action.AutoSaveAndClose)

let debugChannel: vscode.OutputChannel | undefined

export function activate(context: vscode.ExtensionContext) {
	debugChannel ??= vscode.window.createOutputChannel(PACKAGE_NAME)

	if (context.extensionMode === vscode.ExtensionMode.Development) {
		debugChannel?.show(true)
		debugChannel?.appendLine(`${PACKAGE_NAME} activated`)
	}

	let refactorOpenedFiles = new Set<String>()
	let preRefactorOpenFiles = new Set<String>()
	let isRefactoring: boolean = false

	const didRenameListener = vscode.workspace.onDidRenameFiles(async ({ files }) => {
		const action = getActionSetting()

		if (action === Action.Disabled || !isRefactoring) {
			isRefactoring = false
			return
		}
		isRefactoring = false

		debugChannel?.appendLine(`onDidRenameFiles`)

		for (const fileName of refactorOpenedFiles) {
			if (preRefactorOpenFiles.has(fileName)) {
				debugChannel?.appendLine('SKIPPED!')
				continue
			}

			debugChannel?.appendLine(`SAVE/CLOSE doc: ${fileName}`)

			const doc = vscode.workspace.textDocuments.find(d => d.fileName === fileName)
			if (!doc) {
				continue
			}

			if ([Action.AutoSave, Action.AutoSaveAndClose].includes(action)) {
				await doc.save()
			}

			if (action === Action.AutoSaveAndClose) {
				await vscode.window.showTextDocument(doc)
				await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
			}
		}

		refactorOpenedFiles.clear()
		preRefactorOpenFiles.clear()
	})

	const openListener = vscode.workspace.onDidOpenTextDocument(document => {
		if (!isRefactoring || document.languageId !== 'dart') {
			return
		}
		debugChannel?.appendLine(`OPEN doc: ${document.fileName}`)
		refactorOpenedFiles.add(document.fileName)
	})

	const changeListener = vscode.workspace.onDidChangeTextDocument(async event => {
		if (!isRefactoring || event.document.languageId !== 'dart') {
			return
		}
		debugChannel?.appendLine(`CHANGE doc: ${event.document.fileName}`)
		refactorOpenedFiles.add(event.document.fileName)
	})

	const willRenameListener = vscode.workspace.onWillRenameFiles(({ files }) => {
		if (getActionSetting() === Action.Disabled) {
			return
		}
		isRefactoring = true
		for (const editor of vscode.window.visibleTextEditors) {
			preRefactorOpenFiles.add(editor.document.fileName)
		}
		for (const file of files) {
			if (preRefactorOpenFiles.has(file.oldUri.fsPath)) {
				preRefactorOpenFiles.add(file.newUri.fsPath)
			}
		}
		debugChannel?.appendLine(`PRE-REFACTOR:\n${Array.from(preRefactorOpenFiles).join('\n')}\n\n`)
	})

	context.subscriptions.push(
		openListener,
		changeListener,
		willRenameListener,
		didRenameListener,
	)
}

export function deactivate() {
	debugChannel?.dispose()
	debugChannel = undefined
}
