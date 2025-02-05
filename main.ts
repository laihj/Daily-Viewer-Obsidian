import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, TFile, ItemView } from 'obsidian';

interface DailyViewerSettings {
    sortOrder: 'new-to-old' | 'old-to-new';
}

const DEFAULT_SETTINGS: DailyViewerSettings = {
    sortOrder: 'new-to-old'
}

const VIEW_TYPE_DAILY = "daily-viewer-view";

class DailyViewerView extends ItemView {
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() {
        return VIEW_TYPE_DAILY;
    }

    getDisplayText() {
        return "Daily Viewer";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.createEl("h4", { text: "Daily Notes" });
        
        await this.refresh();
    }

    async refresh() {
        const container = this.containerEl.children[1];
        const contentContainer = container.createDiv("daily-viewer-content");
        contentContainer.empty();

        // Get all files
        const files = this.app.vault.getMarkdownFiles();
        
        // Filter and sort files
        const dateFiles = files
            .filter(file => /^\d{8}/.test(file.basename))
            .sort((a, b) => {
                const dateA = parseInt(a.basename.slice(0, 8));
                const dateB = parseInt(b.basename.slice(0, 8));
                return dateB - dateA;  // 降序排列
            });

        for (const file of dateFiles) {
            const fileContainer = contentContainer.createDiv("daily-file-container");
            
            // Create date header
            const date = file.basename;
            const formattedDate = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
            fileContainer.createEl("h2", { text: formattedDate });

            // Create content
            const content = await this.app.vault.read(file);
            const contentEl = fileContainer.createDiv("daily-content");
            contentEl.createEl("div", { text: content });
        }
    }

    async onClose() {
        // Nothing to clean up
    }
}

export default class DailyViewer extends Plugin {
    settings: DailyViewerSettings;
    view: DailyViewerView;

    async onload() {
        await this.loadSettings();

        // Register view
        this.registerView(
            VIEW_TYPE_DAILY,
            (leaf) => (this.view = new DailyViewerView(leaf))
        );

        // Add ribbon icon
        this.addRibbonIcon('calendar-days', 'Daily Viewer', (evt: MouseEvent) => {
            this.activateView();
        });

        // Add command
        this.addCommand({
            id: 'show-daily-viewer',
            name: 'Show Daily Viewer',
            callback: () => {
                this.activateView();
            }
        });

        // Add settings tab
        this.addSettingTab(new DailyViewerSettingTab(this.app, this));
    }

    async activateView() {
        const { workspace } = this.app;
        
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_DAILY)[0];
        
        if (!leaf) {
            leaf = workspace.getRightLeaf(false);
            await leaf.setViewState({
                type: VIEW_TYPE_DAILY,
                active: true,
            });
        }
        
        workspace.revealLeaf(leaf);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class DailyViewerSettingTab extends PluginSettingTab {
    plugin: DailyViewer;

    constructor(app: App, plugin: DailyViewer) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Daily Viewer Settings' });

        new Setting(containerEl)
            .setName('Sort Order')
            .setDesc('Choose how to sort the daily notes')
            .addDropdown(dropdown => 
                dropdown
                    .addOption('new-to-old', 'Newest First')
                    .addOption('old-to-new', 'Oldest First')
                    .setValue(this.plugin.settings.sortOrder)
                    .onChange(async (value: DailyViewerSettings['sortOrder']) => {
                        this.plugin.settings.sortOrder = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.view) {
                            await this.plugin.view.refresh();
                        }
                    })
            );
    }
}
