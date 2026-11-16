/** Mensajes reales grabados de los WebSocket públicos de Binance el 2026-11-16. */
export const SPOT_MESSAGES = [
  '{"stream":"btcusdt@bookTicker","data":{"u":103008655256,"s":"BTCUSDT","b":"64651.84000000","B":"6.82568000","a":"64651.85000000","A":"0.60548000"}}',
  '{"stream":"ethusdt@bookTicker","data":{"u":83420982307,"s":"ETHUSDT","b":"1823.12000000","B":"126.88360000","a":"1823.13000000","A":"0.45400000"}}',
  '{"stream":"eurusdt@bookTicker","data":{"u":784028712,"s":"EURUSDT","b":"1.10100000","B":"13669.60000000","a":"1.10110000","A":"47108.20000000"}}',
] as const;

export const FUTURES_MESSAGES = [
  '{"stream":"xauusdt@bookTicker","data":{"e":"bookTicker","u":12134744412427,"s":"XAUUSDT","ps":"XAUUSDT","b":"3863.01","B":"34.458","a":"3863.02","A":"34.158","T":1794847981009,"E":1794847981009,"st":1}}',
  '{"stream":"nvdausdt@bookTicker","data":{"e":"bookTicker","u":12134744420198,"s":"NVDAUSDT","ps":"NVDAUSDT","b":"159.33000","B":"203.06","a":"159.34000","A":"154.76","T":1794847981057,"E":1794847981058,"st":1}}',
  '{"stream":"aaplusdt@bookTicker","data":{"e":"bookTicker","u":12134744444236,"s":"AAPLUSDT","ps":"AAPLUSDT","b":"353.93000","B":"7.59","a":"353.94000","A":"20.96","T":1794847981181,"E":1794847981181,"st":1}}',
] as const;
