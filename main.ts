import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, TFile, ItemView, setIcon, MarkdownRenderer, Component } from 'obsidian';

interface DailyViewerSettings {
    sortOrder: 'new-to-old' | 'old-to-new';
}

const DEFAULT_SETTINGS: DailyViewerSettings = {
    sortOrder: 'new-to-old'
}

const VIEW_TYPE_DAILY = "daily-viewer-view";

class DailyViewerView extends ItemView {
    component: Component;
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.component = new Component();
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
        const files = this.app.vault.getFiles().filter(file => file instanceof TFile && file.extension === 'md');
        
        // Filter and sort files
        const dateFiles = files
            .filter(file => /^\d{4}-\d{2}-\d{2}$/.test(file.basename))
            .sort((a, b) => {
                // 直接比较日期字符串，因为 YYYY-MM-DD 格式可以直接按字典序排序
                return b.basename.localeCompare(a.basename);  // 降序排列
            });

        for (const file of dateFiles) {
            const fileContainer = contentContainer.createDiv("daily-file-container");
            
            // Create date header with link button
            const headerContainer = fileContainer.createDiv("daily-header-container");
            headerContainer.addClass("daily-header-flex");
            
            // Create date text
            const date = file.basename;
            const formattedDate = `${date.slice(0,4)}-${date.slice(5,7)}-${date.slice(8,10)}`;
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
            
            // 渲染 Markdown 内容
            await MarkdownRenderer.renderMarkdown(
                content,
                markdownContainer,
                file.path,
                this.component
            );

            // 处理 Obsidian 内部图片链接
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
                        imgEl.style.cursor = 'pointer';
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
            
            // 为所有标签添加点击事件
            markdownContainer.querySelectorAll('a.tag').forEach(tagEl => {
                tagEl.addEventListener('click', (e) => {
                    e.preventDefault();
                    const tagName = tagEl.textContent;
                    if (tagName) {
                        // 去掉#符号
                        const cleanTagName = tagName.replace(/^#/, '');
                        // 打开搜索面板并搜索标签
                        this.app.internalPlugins.getPluginById('global-search').instance.openGlobalSearch(`tag:${cleanTagName}`);
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
            (leaf) => (this.view = new DailyViewerView(leaf))
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
            leaf = workspace.getLeaf('tab', 'right');
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
