export interface WorkItem {
    id: number;
    rev: number;
    url: string;
    fields: WorkItemFields;
    _links: any;
    relations?: any[];
}

export interface WorkItemFields {
    'System.Id': number;
    'System.Title': string;
    'System.WorkItemType': string;
    'System.State': string;
    'System.AssignedTo'?: {
        displayName: string;
        uniqueName: string;
    };
    'System.CreatedDate': string;
    'System.ChangedDate': string;
    'System.CommentCount'?: number;
    'System.Tags'?: string;
    'System.IterationPath': string;
    'System.AreaPath': string;
    'Microsoft.VSTS.Common.Priority'?: number;
    'Microsoft.VSTS.Common.Severity'?: string;
    'Microsoft.VSTS.Scheduling.Effort'?: number;
    'Microsoft.VSTS.Scheduling.StoryPoints'?: number;
    'System.Description'?: string;
    'System.History'?: string;
    'Microsoft.VSTS.Common.Activity'?: string;
    'Microsoft.VSTS.Common.ValueArea'?: string;
}

export interface WorkItemType {
    name: string;
    referenceName: string;
    description: string;
    color: string;
    icon: {
        id: string;
        url: string;
    };
}

export interface WorkItemQueryResult {
    queryType: string;
    queryResultType: string;
    asOf: string;
    columns: Array<{
        referenceName: string;
        name: string;
        url: string;
    }>;
    workItems: Array<{
        id: number;
        url: string;
    }>;
}

export interface CreateWorkItemRequest {
    op: string;
    path: string;
    from: null;
    value: string;
}

export interface WorkItemState {
    name: string;
    color: string;
    category: string;
}

export interface WorkItemTransition {
    to: string;
    action: string;
}

export enum WorkItemTypeEnum {
    UserStory = 'User Story',
    Task = 'Task',
    Bug = 'Bug',
    Epic = 'Epic',
    Feature = 'Feature',
    Issue = 'Issue'
}

export enum WorkItemStateEnum {
    New = 'New',
    Active = 'Active',
    Resolved = 'Resolved',
    Closed = 'Closed',
    Removed = 'Removed',
    Done = 'Done',
    ToDo = 'To Do',
    InProgress = 'In Progress',
    ReadyForReview = 'Ready for Review',
    Approved = 'Approved'
}