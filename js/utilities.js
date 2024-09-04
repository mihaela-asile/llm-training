/**
 * Copyright (c) 2024 Quantellia LLC
 * This source code is licensed under the MIT license found in the LICENSE file in the root directory of this source tree.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}