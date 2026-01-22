declare const acquireVsCodeApi: any;

class VSCodeAPI {
  private api: any;

  constructor() {
    this.api = acquireVsCodeApi();
  }

  postMessage(message: any) {
    this.api.postMessage(message);
  }

  setState(state: any) {
    this.api.setState(state);
  }

  getState() {
    return this.api.getState();
  }
}

export const vscode = new VSCodeAPI();
