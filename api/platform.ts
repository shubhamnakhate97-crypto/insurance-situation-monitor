/* SPDX-License-Identifier: MIT */
import { handlePlatform } from '../apps/web/platform-api.js';
export default {fetch:(request:Request)=>handlePlatform(request,process.env)};
