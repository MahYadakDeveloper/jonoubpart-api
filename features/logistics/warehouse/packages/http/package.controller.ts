import { Controller, Post } from '@nestjs/common';

@Controller()
export class PackagesController {
  /**
   * @param packageId the package id is achieved from scanning the barcode near
   *   recipient
   * @param verificationCode a verification code is sent after package is
   *   resolved by scan after this step to hand over to recipient it need to be
   *   verified if proof the recipient
   */
  @Post()
  handOver(packageId: string, verificationCode: string) {}
}
