/** @type {import('tailwindcss').Config} */
import defaultTheme from "tailwindcss/defaultTheme"
import { grey, ink, meaning, scale } from "./lib/theme.js"

const blue = scale(meaning.info, ["#C7D8FB", "#93B4F6"])
const yellow = scale(meaning.change, ["#FBEFB0", "#F5DC6A"])
const green = scale(meaning.positive, ["#BFEBCD", "#86D7A3"])
const red = scale(meaning.negative, ["#F9C9C9", "#F09999"])

/* eslint-disable import/no-anonymous-default-export */
export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Source Sans 3 Variable"', ...defaultTheme.fontFamily.sans],
        mono: ['"Source Code Pro Variable"', ...defaultTheme.fontFamily.mono],
        // the app's name and the tagline under it, nothing else
        brand: ["Tinos", "Times New Roman", "serif"],
      },
      colors: {
        ink,
        // by meaning: use these in new code
        info: meaning.info,
        change: meaning.change,
        positive: meaning.positive,
        negative: meaning.negative,

        // Greys. Fatebook's code uses "neutral" and "gray" throughout.
        neutral: grey,
        gray: grey,
        slate: grey,
        zinc: grey,
        stone: grey,

        // Fatebook's purple, and every other hue with no meaning here,
        // becomes near-black and grey. 600 and up are near-black so that
        // what used to be a purple button is now a near-black one.
        ...Object.fromEntries(
          [
            "indigo",
            "purple",
            "violet",
            "fuchsia",
            "pink",
            "sky",
            "cyan",
            "teal",
          ].map((name) => [
            name,
            {
              ...grey,
              500: grey[600],
              600: ink,
              700: grey[950],
              800: grey[950],
              900: grey[950],
            },
          ]),
        ),

        // The four colours with a meaning, under Tailwind's usual names too.
        blue,
        yellow,
        amber: yellow,
        orange: yellow,
        green,
        emerald: green,
        lime: green,
        red,
        rose: red,
      },
      // #6E7A8E as small text is 4.3:1 on white, just under the 4.5:1
      // accessibility line, so as a TEXT colour "400" is one step darker.
      // Borders, icons and fills keep the brand grey.
      textColor: Object.fromEntries(
        [
          "neutral",
          "gray",
          "slate",
          "zinc",
          "stone",
          "indigo",
          "purple",
          "violet",
          "fuchsia",
          "pink",
          "sky",
          "cyan",
          "teal",
        ].map((name) => [name, { 300: grey[400], 400: grey[500] }]),
      ),
      inset: {
        "calc-50-plus-1rem": "calc(50% + 1rem)",
      },
      typography: {
        DEFAULT: {
          css: {
            "--tw-prose-body": grey[800],
            "--tw-prose-headings": ink,
            "--tw-prose-links": ink,
            "--tw-prose-bold": ink,
            "--tw-prose-code": ink,
            "--tw-prose-quotes": ink,
            "--tw-prose-counters": grey[500],
            "--tw-prose-bullets": grey[300],
            "--tw-prose-hr": grey[200],
            "--tw-prose-captions": grey[500],
          },
        },
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
    require("@tailwindcss/container-queries"),
    require("daisyui"),
  ],
  daisyui: {
    themes: [
      {
        mytheme: {
          // no brand colour: the main action colour is near-black
          primary: ink,
          "primary-content": "#ffffff",
          secondary: grey[500],
          "secondary-content": "#ffffff",
          accent: grey[500],
          "accent-content": "#ffffff",
          neutral: ink,
          "neutral-content": "#ffffff",
          "base-100": "#ffffff",
          "base-200": grey[100],
          "base-300": grey[200],
          "base-content": ink,
          info: meaning.info.DEFAULT,
          success: meaning.positive.DEFAULT,
          warning: meaning.change.DEFAULT,
          error: meaning.negative.DEFAULT,
        },
      },
    ],
    logs: false,
  },
}
