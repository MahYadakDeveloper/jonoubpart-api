import { HashService } from '@infra/crypto-hash';
import { Injectable } from '@nestjs/common';
import { Courier, type CourierRepository } from './courier.repository';

@Injectable()
export class CourierService {
  constructor(
    private readonly repository: CourierRepository,
    private readonly hashService: HashService,
  ) {}

  findById(id: string): Promise<Courier | null> {
    return this.repository.findById(id);
  }

  findAll(): Promise<Courier[]> {
    return this.repository.findAll();
  }

  async register({
    fullName,
    phone,
    password,
  }: {
    fullName: string;
    phone: string;
    password: string;
  }) {
    await this.repository.create({
      fullName,
      phone,
      hashedPassword: await this.hashService.hash(password),
    });
  }

  async changePassword(
    courierId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const courier = await this.repository.findById(courierId);
    if (!courier) throw new Error();

    const verified = await this.hashService.verify(
      currentPassword,
      courier.hashedPassword,
    );
    if (!verified) throw new Error();

    await this.repository.update(courierId, {
      hashedPassword: await this.hashService.hash(newPassword),
    });
  }

  async delete(courierId: string) {
    await this.repository.delete(courierId);
  }

  // toDto({ deliveries, phone, ...rest }: Courier): {
  //   return {
  //     ...rest,
  //     phoneNumber: phone,
  //   };
  // }
}
