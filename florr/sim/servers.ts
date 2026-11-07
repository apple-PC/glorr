// 【还原阶段:服务器列表归零】
// 原版 florr 的分区由游戏内传送门/区域承载,不存在「设置面板里切换 3 个 WS 服务器」。
// 保留空列表与导出符号仅为兼容 UI 的旧接口;不再发起任何公网探测。
// 阶段 D 若加回多房间,走「同一 sim + 网络同步层」,不复制模拟逻辑。
export interface ServerDef {
  id: string;
  name: string;
  url: string;
  note: string;
}

export const SERVER_ORIGIN = '';
export const SERVER_WS_ORIGIN = '';
export const SERVERS: ServerDef[] = [];
export const DEFAULT_SERVER_ID = 'local';

export function getServer(id: string): ServerDef | undefined {
  return SERVERS.find((s) => s.id === id);
}
