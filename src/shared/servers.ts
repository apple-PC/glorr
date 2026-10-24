// glorr 服务器列表配置(设置面板里的 3 个命名服务器)
// 架构:一套部署按 URL ?room= 参数分出 3 个命名服务器,账号数据互通。
// SERVER_ORIGIN 为公网服务端地址(Fly 提供),三个房间共用,仅 ?room= 不同。
// 若 Fly 应用名不是 glorr-server,把 SERVER_ORIGIN 改成你的 <app>.fly.dev 即可。
export const SERVER_ORIGIN = 'https://glorr-server.fly.dev';
export const SERVER_WS_ORIGIN = SERVER_ORIGIN.replace(/^https:/, 'wss:');

export interface ServerDef {
  id: string;
  name: string;
  url: string;
  note: string;
}

export const SERVERS: ServerDef[] = [
  { id: 'scarlet', name: 'Scarlet', url: `${SERVER_WS_ORIGIN}/?room=scarlet`, note: '主服务器 · 花园' },
  { id: 'youse', name: 'Youse', url: `${SERVER_WS_ORIGIN}/?room=youse`, note: '均衡服务器 · 花园' },
  { id: 'huaduo', name: 'Huaduo', url: `${SERVER_WS_ORIGIN}/?room=huaduo`, note: '花朵服务器 · 花园' },
];

export const DEFAULT_SERVER_ID = SERVERS[0].id;

export function getServer(id: string): ServerDef | undefined {
  return SERVERS.find((s) => s.id === id);
}
