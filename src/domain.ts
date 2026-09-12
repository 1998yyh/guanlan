export type Quote = {code:string;name:string;price:number;change:number;turnover:number;volumeRatio:number};
export type Rule = {id:string;code:string;field:'price'|'change';operator:'gte'|'lte';threshold:number;enabled:boolean};
export type Trade = {code:string;side:'buy'|'sell';price:number;quantity:number;fee:number};
export function screenStocks(quotes:Quote[],filter:{query:string;minChange:number;minVolumeRatio:number}):Quote[]{
 const q=filter.query.trim();
 return quotes.filter(s=>(s.code.includes(q)||s.name.includes(q))&&s.change>=filter.minChange&&s.volumeRatio>=filter.minVolumeRatio).sort((a,b)=>b.change-a.change);
}
export function evaluateRule(rule:Rule,quote:Quote,previous:boolean):boolean{
 const value=quote[rule.field];
 return rule.enabled&&!previous&&rule.code===quote.code&&Number.isFinite(value)&&Number.isFinite(rule.threshold)&&(rule.operator==='gte'?value>=rule.threshold:value<=rule.threshold);
}
export function summarizeTrades(trades:Trade[]):{realized:number;positions:Record<string,{quantity:number;cost:number}>}{
 const positions:Record<string,{quantity:number;cost:number}>={};let realized=0;
 for(const t of trades){
  if(!/^\d{6}$/.test(t.code)||!Number.isFinite(t.price)||t.price<=0||!Number.isInteger(t.quantity)||t.quantity<=0||!Number.isFinite(t.fee)||t.fee<0||!['buy','sell'].includes(t.side))throw new Error('请输入有效的代码、价格、数量和费用');
  const p=positions[t.code]??{quantity:0,cost:0};
  if(t.side==='buy'){p.cost=(p.cost*p.quantity+t.price*t.quantity+t.fee)/(p.quantity+t.quantity);p.quantity+=t.quantity;}
  else{if(t.quantity>p.quantity)throw new Error('持仓不足，请先补录买入记录');realized+=(t.price-p.cost)*t.quantity-t.fee;p.quantity-=t.quantity;if(!p.quantity)p.cost=0;}
  positions[t.code]=p;
 }
 return {realized:Math.round(realized*100)/100,positions};
}
