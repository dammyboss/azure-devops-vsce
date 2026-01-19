// Fixed CSS and card rendering
// Replace lines 1050-1090 in boardPanel.ts with:

/* Work Item Cards */
.card {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 10px 12px 10px 16px;
    cursor: pointer;
    position: relative;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.card:hover {
}

.card.selected {
}

.card-type-border {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    border-radius: 4px 0 0 4px;
}

.priority-indicator {
    display: none;
}

// Replace _renderCard method (around line 2100) with:
private _renderCard(item: BoardWorkItem, colIndex: number = 0, itemIndex: number = 0): string {
    const typeClass = item.type.toLowerCase().replace(/\s+/g, '-');
    const initials = item.assignedTo?.displayName
        ? item.assignedTo.displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
        : '?';
    const assignedClass = item.assignedTo ? '' : 'unassigned';
    const typeIcon = this._getTypeIcon(item.type);
    const stateColor = this._getStateColor(item.state);

    const tags = item.tags
        ? item.tags.split(';').slice(0, 3).map(tag =>
            `<span class="tag">${this._escapeHtml(tag.trim())}</span>`
          ).join('')
        : '';

    return `
    <div class="card"
         draggable="true"
         data-id="${item.id}"
         data-col="${colIndex}"
         data-item="${itemIndex}"
         data-title="${this._escapeHtml(item.title)}"
         data-type="${this._escapeHtml(item.type)}"
         data-priority="${item.priority || ''}"
         data-assignee="${item.assignedTo?.uniqueName || ''}"
         data-assignee-name="${item.assignedTo?.displayName || ''}"
         data-state="${this._escapeHtml(item.state)}"
         data-tags="${item.tags || ''}"
         tabindex="0"
         ondragstart="handleDragStart(event, ${item.id})"
         ondragend="handleDragEnd(event)"
         onclick="openWorkItem(${item.id})"
         oncontextmenu="showContextMenu(event, ${item.id})"
         onfocus="selectCard(this)">
        <div class="card-type-border" style="background: ${stateColor}"></div>
        <div class="card-header">
            <span class="card-type-icon" title="${this._escapeHtml(item.type)}">${typeIcon}</span>
            <span class="card-id" onclick="event.stopPropagation(); openWorkItem(${item.id})">#${item.id}</span>
            <span class="state-indicator" style="background: ${stateColor}" title="${this._escapeHtml(item.state)}"></span>
            <div class="card-actions">
                <button class="card-action-btn" onclick="event.stopPropagation(); showContextMenu(event, ${item.id})" title="More actions">⋯</button>
            </div>
        </div>
        <div class="card-title">${this._escapeHtml(item.title)}</div>
        ${tags ? `<div class="card-tags">${tags}</div>` : ''}
        <div class="card-footer">
            <div class="card-meta">
                <div class="card-avatar ${assignedClass}" title="${item.assignedTo?.displayName || 'Unassigned'}">
                    ${initials}
                </div>
            </div>
        </div>
    </div>`;
}
