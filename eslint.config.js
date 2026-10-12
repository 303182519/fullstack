import { base } from '@fedstack/eslint-config'

// 根配置：仅负责 packages/* 与根级配置文件本身
// apps/* 下各应用应自带 eslint.config.js，分别引用 react() / node()
export default base()
