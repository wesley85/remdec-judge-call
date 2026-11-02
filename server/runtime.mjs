import {AsyncLocalStorage} from 'node:async_hooks';
export const requestContext=new AsyncLocalStorage();
export const env={...process.env,DB:null};
export async function getOrganizer(){return requestContext.getStore()?.user||null}
