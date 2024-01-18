import path from 'path'
import { TsconfigPathsPlugin } from 'tsconfig-paths-webpack-plugin'
import webpack from 'webpack'
import nodeExternals from 'webpack-node-externals'

const distPath = path.resolve(__dirname, 'dist')

const config: webpack.Configuration = {
  mode: 'none',
  devtool: process.env.DEBUG ? 'inline-source-map' : false,
  entry: './src/app.ts',
  target: 'node',
  output: {
    path: distPath,
    filename: '[name].js',
  },
  externals: [nodeExternals()],
  externalsPresets: { node: true },
  ignoreWarnings: [/^(?!CriticalDependenciesWarning$)/],
  optimization: {
    nodeEnv: false,
  },
  resolve: {
    extensions: ['.ts', '.js', '.tsx'],
    plugins: [
      new TsconfigPathsPlugin({
        configFile: path.resolve(__dirname, './tsconfig.json'),
      }),
    ],
  },
  module: {
    rules: [
      {
        test: /.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: path.resolve(__dirname, './tsconfig.json'),
            },
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
}

// eslint-disable-next-line import/no-default-export
export default config
