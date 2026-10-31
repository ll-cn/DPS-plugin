import pluginInfo from './guoba/pluginInfo.js'
import schemas from './guoba/schemas.js'
import { getConfigData, setConfigData } from './guoba/config.js'

/** 锅巴（Guoba-Plugin）配置面板支持 */
export function supportGuoba() {
  return {
    pluginInfo,
    configInfo: {
      schemas,
      getConfigData,
      setConfigData
    }
  }
}
