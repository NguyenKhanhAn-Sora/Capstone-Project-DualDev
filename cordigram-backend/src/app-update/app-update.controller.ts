import { Controller, Get } from '@nestjs/common';

@Controller('app-update')
export class AppUpdateController {
  @Get('check')
  check() {
    return {
      versionCode: parseInt(process.env.MOBILE_APP_VERSION_CODE ?? '1', 10),
      versionName: process.env.MOBILE_APP_VERSION_NAME ?? '1.0.0',
      downloadUrl: process.env.MOBILE_APK_DOWNLOAD_URL ?? '',
      changelog: process.env.MOBILE_APP_CHANGELOG ?? 'Cập nhật mới.',
      forceUpdate: process.env.MOBILE_APP_FORCE_UPDATE === 'true',
    };
  }
}
