// glorr 共享类型定义

export type PetalKind = 'melee' | 'ranged' | 'heal' | 'buff';

export interface PetalDef {
  id: string;
  name: string;
  kind: PetalKind;
  desc: string;
  /** 基础值(普通稀有度),随稀有度按曲线缩放 */
  dmg: number;
  hp: number;
  /** 远程花瓣装填时间(秒);近战/持续类为 0 */
  reload: number;
  /** 可获得的最低稀有度索引 */
  minRarity: number;
  /** 治疗类:每秒回复 */
  healPerSec?: number;
  /** 治疗类:命中瞬间回复 */
  onHitHeal?: number;
  /** 减速抗性 0..1 */
  slowResist?: number;
  /** 增益:旋转速度加成(加法) */
  rotBonus?: number;
  /** 增益:花瓣轨道半径加成(攻击范围) */
  orbitBonus?: number;
  /** 增益:掉落拾取半径加成 */
  pickupBonus?: number;
  /** 重型:旋转速度乘区 */
  rotMul?: number;
  /** 远程参数 */
  projSpeed?: number;
  projRange?: number;
  /** 远程弹丸数量(豌豆四向散射) */
  projCount?: number;
  /** 远程命中附加减速 */
  slow?: number;
  slowDur?: number;
}

export type MobBehavior = 'passive' | 'neutral' | 'aggressive' | 'static';

export interface MobDef {
  id: string;
  name: string;
  hp: number;       // 普通稀有度基础血量
  dmg: number;      // 接触伤害
  speed: number;
  radius: number;
  xp: number;
  armor: number;    // 固定减伤
  behavior: MobBehavior;
  aggro: number;    // 索敌半径
  /** 达到该稀有度后由被动转为中立 */
  neutralFrom?: number;
  /** 普通稀有度下的总毒量(有则攻击附带中毒) */
  poison?: number;
  /** 远程攻击参数 */
  ranged?: { dmg: number; speed: number; cd: number; range: number };
  color: string;
  drops: [string, number][]; // [花瓣 id, 权重]
}

/** 背包/已装备的花瓣实例 */
export interface PetalInst {
  uid: number;
  id: string;
  rarity: number;
}

/** 单个花瓣槽的运行态(服务端权威) */
export interface SlotState {
  id: string;
  rarity: number;
  hp: number;
  maxHp: number;
  /** 剩余装填时间(秒,0=就绪) */
  cd: number;
}

/** 序列化给客户端的槽位概览 */
export interface SlotWire {
  id: string;
  rarity: number;
  hpPct: number;
  cdPct: number;
  /** 破碎再生中(仅单机客户端用于 UI 显示,联机不传) */
  broken?: boolean;
}
