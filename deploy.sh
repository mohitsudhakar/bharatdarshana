#!/bin/bash
# Deploy script for Firebase Hosting
# Run: ./deploy.sh

set -e

echo "Building static export..."
npm run build

echo "Deploying to Firebase..."
if [ -f node_modules/.bin/firebase ]; then
  ./node_modules/.bin/firebase deploy --only hosting
else
  npx firebase deploy --only hosting
fi

echo "Done! Check the URL printed above."