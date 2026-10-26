// Images the screens import, such as the app's mark, which Metro bundles with the app: each is
// what an Image's source takes.
declare module "*.png" {
  import type { ImageSourcePropType } from "react-native";
  const image: ImageSourcePropType;
  export default image;
}

declare module "*.jpg" {
  import type { ImageSourcePropType } from "react-native";
  const image: ImageSourcePropType;
  export default image;
}
