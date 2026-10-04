import { createContext, useContext } from 'react'
import { hq } from './hq.js'

const HQContext = createContext(hq)

export function HQProvider({ children }) {
  return <HQContext.Provider value={hq}>{children}</HQContext.Provider>
}

export function useHQ() { return useContext(HQContext) }
