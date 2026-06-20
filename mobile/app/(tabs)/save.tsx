import { Redirect } from 'expo-router';

/** Legacy route — share target and old links redirect to Home. */
export default function SaveRedirect() {
  return <Redirect href="/" />;
}
