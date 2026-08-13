export type ExternalAiBudgetState = "OK" | "WARNING_75" | "WARNING_90" | "HARD_STOP";
export type ExternalAiBudgetInput = {
  taskCostHuf: number;
  workerCostHuf: number;
  dailyCostHuf: number;
  monthlyCostHuf: number;
  activeMinutes: number;
  retryCount: number;
  taskLimitHuf: number;
  workerLimitHuf: number;
  dailyLimitHuf?: number | null;
  monthlyLimitHuf?: number | null;
  maxActiveMinutes?: number;
  maxRetries?: number;
};

function optionalPositiveInt(value: string | undefined) {
  const parsed=Number(value); return Number.isFinite(parsed)&&parsed>0?Math.round(parsed):null;
}
function ratio(value:number,limit:number|null|undefined){return limit&&limit>0?value/limit*100:0}
function stateForPercent(percent:number):ExternalAiBudgetState{return percent>=100?"HARD_STOP":percent>=90?"WARNING_90":percent>=75?"WARNING_75":"OK"}
function maxState(states:ExternalAiBudgetState[]):ExternalAiBudgetState{
  const order:ExternalAiBudgetState[]=["OK","WARNING_75","WARNING_90","HARD_STOP"];
  return states.reduce((best,current)=>order.indexOf(current)>order.indexOf(best)?current:best,"OK");
}

export function externalAiBudgetConfiguration(){
  return {
    taskBudgetHuf:2500,
    forgeBudgetHuf:1500,
    guardBudgetHuf:1000,
    dailyLimitHuf:optionalPositiveInt(process.env.DIMPRO_EXTERNAL_AI_DAILY_BUDGET_HUF),
    monthlyLimitHuf:optionalPositiveInt(process.env.DIMPRO_EXTERNAL_AI_MONTHLY_BUDGET_HUF),
    maxActiveMinutesPerWorker:45,
    maxFixRounds:2,
    thresholds:[75,90,100],
  };
}

export function evaluateExternalAiBudget(input:ExternalAiBudgetInput){
  const metrics=[
    {code:"TASK_COST",value:input.taskCostHuf,limit:input.taskLimitHuf,unit:"HUF"},
    {code:"WORKER_COST",value:input.workerCostHuf,limit:input.workerLimitHuf,unit:"HUF"},
    {code:"DAILY_COST",value:input.dailyCostHuf,limit:input.dailyLimitHuf,unit:"HUF"},
    {code:"MONTHLY_COST",value:input.monthlyCostHuf,limit:input.monthlyLimitHuf,unit:"HUF"},
    {code:"ACTIVE_MINUTES",value:input.activeMinutes,limit:input.maxActiveMinutes??45,unit:"MIN"},
    {code:"RETRY_COUNT",value:input.retryCount,limit:input.maxRetries??2,unit:"COUNT"},
  ].map((metric)=>({...metric,percent:ratio(metric.value,metric.limit),state:metric.limit?stateForPercent(ratio(metric.value,metric.limit)):"OK" as ExternalAiBudgetState}));
  const state=maxState(metrics.map((metric)=>metric.state));
  return {state,hardStop:state==="HARD_STOP",metrics,reasons:metrics.filter((metric)=>metric.state!=="OK").map((metric)=>`${metric.code}: ${metric.state} (${metric.percent.toFixed(1)}%)`)};
}
