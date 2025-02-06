import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, TFile, ItemView, setIcon, MarkdownRenderer, Component } from 'obsidian';

interface DailyViewerSettings {
    sortOrder: 'new-to-old' | 'old-to-new';
    dateFormat: string;
}

const DEFAULT_SETTINGS: DailyViewerSettings = {
    sortOrder: 'new-to-old',
    dateFormat: 'YYYY-MM-DD'
}

const VIEW_TYPE_DAILY = "daily-viewer-view";

class DailyViewerView extends ItemView {
    component: Component;
    settings: DailyViewerSettings;

    constructor(leaf: WorkspaceLeaf, settings: DailyViewerSettings) {
        super(leaf);
        this.component = new Component();
        this.settings = settings;
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

        // Create header container
        const headerContainer = container.createDiv('daily-viewer-header');

        // Add title
        headerContainer.createEl("h4", { text: "Daily Notes" });

        // Add refresh button
        const refreshButton = headerContainer.createEl('button', {
            cls: ['daily-refresh-button', 'clickable-icon']
        });
        setIcon(refreshButton, 'refresh-cw');
        refreshButton.addEventListener('click', () => {
            // Clear content and reload
            const contentContainer = container.querySelector('.daily-viewer-content');
            if (contentContainer) {
                contentContainer.remove();
            }
            this.refresh();
        });
        
        await this.refresh();
    }

    async refresh() {
        const container = this.containerEl.children[1];
        // Find or create content container
        let contentContainer = container.querySelector('.daily-viewer-content');
        if (!contentContainer) {
            contentContainer = container.createDiv('daily-viewer-content');
        }
        contentContainer.empty();

        // Get all files
        const files = this.app.vault.getFiles().filter(file => file instanceof TFile && file.extension === 'md');
        const moment = (window as any).moment;
        
        // Filter and sort files
        const dateFiles = files
            .filter(file => {
                try {
                    // Try to parse filename using the format from settings
                    // Parse using non-strict mode
                    const parsed = moment(file.basename, this.settings.dateFormat);
                    // Check if it's a valid date and format matches
                    const isValid = parsed.isValid() && 
                        parsed.format(this.settings.dateFormat) === file.basename;
                    return isValid;
                } catch (error) {
                    return false;
                }
            })
            .sort((a, b) => {
                const dateA = moment(a.basename, this.settings.dateFormat);
                const dateB = moment(b.basename, this.settings.dateFormat);
                if (this.settings.sortOrder === 'old-to-new') {
                    return dateA.diff(dateB);
                }
                return dateB.diff(dateA);
            });

        for (const file of dateFiles) {
            const fileContainer = contentContainer.createDiv("daily-file-container");
            
            // Create date header with link button
            const headerContainer = fileContainer.createDiv("daily-header-container");
            headerContainer.addClass("daily-header-flex");
            
            // Create date text
            const moment = (window as any).moment;
            const date = moment(file.basename, this.settings.dateFormat);
            const formattedDate = date.format(this.settings.dateFormat);
            headerContainer.createEl("h2", { text: formattedDate });
            
            // Create link button
            const linkButton = headerContainer.createEl("button", {
                cls: ["daily-link-button", "clickable-icon"]
            });
            setIcon(linkButton, "link");
            
            // Add click handler
            linkButton.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.app.workspace.openLinkText(file.basename, "", true);
            });

            // Create content container
            const contentEl = fileContainer.createDiv("daily-content");
            
            // Get file content
            const content = await this.app.vault.read(file);
            
            // Create markdown content
            const markdownContainer = contentEl.createDiv("daily-markdown");
            
            // Render Markdown content
            await MarkdownRenderer.renderMarkdown(
                content,
                markdownContainer,
                file.path,
                this.component
            );

            // Handle Obsidian internal image links
            markdownContainer.querySelectorAll('.internal-embed').forEach((embedEl) => {
                const src = embedEl.getAttribute('src');
                if (src) {
                    const imageFile = this.app.metadataCache.getFirstLinkpathDest(src, file.path);
                    if (imageFile) {
                        const resourcePath = this.app.vault.getResourcePath(imageFile);
                        
                        // 创建图片元素
                        const imgEl = embedEl.createEl('img', {
                            attr: {
                                src: resourcePath,
                                'data-path': imageFile.path
                            }
                        });

                        // 添加点击事件
                        imgEl.addEventListener('click', (e) => {
                            e.preventDefault();
                            this.app.workspace.openLinkText(
                                imageFile.path,
                                file.path,
                                true
                            );
                        });
                    }
                }
            });
            
            // Add click events for all tags
            markdownContainer.querySelectorAll('a.tag').forEach(tagEl => {
                tagEl.addEventListener('click', (e) => {
                    e.preventDefault();
                    const tagName = tagEl.textContent;
                    if (tagName) {
                        // Remove # symbol
                        const cleanTagName = tagName.replace(/^#/, '');
                        // Open search panel and search for tag
                        // Open search with tag
                        this.app.workspace.openLinkText(`tag:${cleanTagName}`, '', true);
                    }
                });
            });
        }
    }

    async onClose() {
        this.component.unload();
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
            (leaf) => (this.view = new DailyViewerView(leaf, this.settings))
        );

        // Add ribbon icon
        this.addRibbonIcon('calendar-days', 'Daily Viewer', (evt: MouseEvent) => {
            this.activateView();
        });

        // Add commands
        this.addCommand({
            id: 'show-daily-viewer',
            name: 'Show Daily Viewer',
            callback: () => {
                this.activateView();
            }
        });

        // Add debug command
        this.addCommand({
            id: 'toggle-dev-tools',
            name: 'Toggle Developer Tools',
            callback: () => {
                // @ts-ignore
                this.app.toggleDevTools();
            }
        });

        // Add settings tab
        this.addSettingTab(new DailyViewerSettingTab(this.app, this));
    }

    async activateView() {
        const { workspace } = this.app;
        
        // 检查是否已存在 Daily Viewer 视图
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_DAILY)[0];
        
        if (!leaf) {
            // 如果不存在，在右侧创建新的标签页
            leaf = workspace.getLeaf('split');
            await leaf.setViewState({
                type: VIEW_TYPE_DAILY,
                active: true,
            });
        }
        
        // 跳转到对应标签页
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
        containerEl.createEl('h2', { text: 'Daily Viewer Settings', cls: 'daily-viewer-settings-header' });

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

        new Setting(containerEl)
            .setName('Date Format')
            .setDesc('Format for daily note filenames (using Moment.js format)')
            .addText(text => {
                text.setPlaceholder('YYYY-MM-DD')
                    .setValue(this.plugin.settings.dateFormat)
                    .onChange(async (value) => {
                        // 验证日期格式是否合法
                        try {
                            const moment = (window as any).moment;
                            if (moment) {
                                const testDate = moment().format(value);
                                if (testDate !== 'Invalid date') {
                                    this.plugin.settings.dateFormat = value;
                                    await this.plugin.saveSettings();
                                    // 刷新视图
                                    if (this.plugin.view) {
                                        await this.plugin.view.refresh();
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Invalid date format:', error);
                        }
                    });
            });
    }
}
