import resolve from '@rollup/plugin-node-resolve';
import babel from '@rollup/plugin-babel';
import vue from 'rollup-plugin-vue';
import typescript from 'rollup-plugin-typescript2';
import commonjs from 'rollup-plugin-commonjs'
import css from 'rollup-plugin-css-only'

export default {
    input: 'pages/home/App.vue',

    output: {
        file: 'dist/home/index.js',
        format: 'umd',
        name: 'App'
    },
    plugins: [
        css(),
        typescript({ tsconfigOverride: { compilerOptions: { module: "es2015" } } }),
        commonjs(),
        vue({ template: { optimizeSSR: false }, css: true }),  // { template: { optimizeSSR: true } }
        resolve({ extensions: ['.vue'] }),  // 
        babel({ babelHelpers: 'bundled' })
    ],
    // 指出应将哪些模块视为外部模块
    // external: ['koa']
    // external: id => /lodash/.test(id)
};



