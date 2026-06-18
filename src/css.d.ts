// CSS / CSS Module の型宣言（Expo web で global.css・*.module.css を import するため）
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css';
