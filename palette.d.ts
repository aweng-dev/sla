/** Type surface for `palette.js`, which is authored as JS so that
 *  `tailwind.config.js` can import it without a build step. */
export type Ramp = Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>

export declare const neutral: Ramp
export declare const accent: Ramp
export declare const brand: Ramp
export declare const success: Ramp
export declare const danger: Ramp
export declare const coral: Ramp
export declare const magenta: Ramp
export declare const teal: Ramp

export declare const surface: {
  white: string
  rail: string
  railActive: string
  tableHead: string
  cream: string
  inkDeep: string
}

export declare const categorical: string[]

export declare const palette: {
  neutral: Ramp
  accent: Ramp
  brand: Ramp
  success: Ramp
  danger: Ramp
  coral: Ramp
  magenta: Ramp
  teal: Ramp
  surface: typeof surface
  categorical: string[]
}

export default palette
