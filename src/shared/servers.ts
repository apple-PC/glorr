// glorr 服务器列表配置(设置面板里的 3 个命名服务器)
// 当前架构:一套部署按 URL ?room= 参数分出 3 个命名服务器,账号数据互通。
// 默认指向本机(localhost:8080)的三个房间,本机运行 npm start 即可直接玩。
// 部署到公网后,把三个 url 改成你的域名即可,例如:
//   wss://glorr.example.com/?room=scarlet
export interface ServerDef {
  id: string;
  name: string;
  url: string;
  note: string;
}

export const SERVERS: ServerDef[] = [
  { id: 'scarlet', name: 'Scarlet', url: 'ws://localhost:8080/?room=scarlet', note: '主服务器 · 花园' },
  { id: 'youse', name: 'Youse', url: 'ws://localhost:8080/?room=youse', note: '均衡服务器 · 花园' },
  { id: 'huaduo', name: 'Huaduo', url: 'ws://localhost:8080/?room=huaduo', note: '花朵服务器 · 花园' },
];

export const DEFAULT_SERVER_ID = SERVERS[0].id;

export function getServer(id: string): ServerDef | undefined {
  return SERVERS.find((s) => s.id === id);
}
