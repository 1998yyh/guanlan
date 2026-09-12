import { describe, it, expect } from 'vitest';
import { screenStocks, evaluateRule, summarizeTrades } from '../src/domain';
const quote = {code:'600519',name:'贵州茅台',price:1500,change:2.3,turnover:1.2,volumeRatio:1.8};
describe('选股',()=>{
 it('组合代码搜索与涨幅、量比条件',()=>{expect(screenStocks([quote],{query:'600',minChange:2,minVolumeRatio:1.5})).toHaveLength(1);expect(screenStocks([quote],{query:'平安',minChange:2,minVolumeRatio:1.5})).toHaveLength(0)});
});
describe('预警',()=>{
 const rule={id:'r',code:'600519',field:'price' as const,operator:'gte' as const,threshold:1500,enabled:true};
 it('等于阈值也触发',()=>expect(evaluateRule(rule,quote,false)).toBe(true));
 it('持续满足时去重',()=>expect(evaluateRule(rule,quote,true)).toBe(false));
 it('停用或缺失价格不触发',()=>{expect(evaluateRule({...rule,enabled:false},quote,false)).toBe(false);expect(evaluateRule(rule,{...quote,price:NaN},false)).toBe(false)});
});
describe('复盘',()=>{
 it('按移动平均成本计算已实现盈亏并扣费用',()=>expect(summarizeTrades([{code:'600519',side:'buy',price:100,quantity:100,fee:5},{code:'600519',side:'sell',price:110,quantity:50,fee:5}])).toMatchObject({realized:492.5,positions:{'600519':{quantity:50,cost:100.05}}}));
 it('拒绝卖出超出记录持仓',()=>expect(()=>summarizeTrades([{code:'600519',side:'sell',price:100,quantity:100,fee:0}])).toThrow('持仓不足'));
 it('拒绝无效金额',()=>expect(()=>summarizeTrades([{code:'600519',side:'buy',price:-1,quantity:100,fee:0}])).toThrow());
});
