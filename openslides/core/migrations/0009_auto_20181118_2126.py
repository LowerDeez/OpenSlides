# Generated by Django 2.1.3 on 2018-11-18 20:26

import django.db.models.deletion
import jsonfield.encoder
import jsonfield.fields
from django.conf import settings
from django.db import migrations, models

import openslides.utils.models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0008_changed_logo_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="History",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("element_id", models.CharField(max_length=255)),
                ("now", models.DateTimeField(auto_now_add=True)),
                ("information", models.CharField(max_length=255)),
            ],
            options={"default_permissions": ()},
            bases=(openslides.utils.models.RESTModelMixin, models.Model),
        ),
        migrations.CreateModel(
            name="HistoryData",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "full_data",
                    jsonfield.fields.JSONField(
                        dump_kwargs={
                            "cls": jsonfield.encoder.JSONEncoder,
                            "separators": (",", ":"),
                        },
                        load_kwargs={},
                    ),
                ),
            ],
            options={"default_permissions": ()},
        ),
        migrations.AddField(
            model_name="history",
            name="full_data",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE, to="core.HistoryData"
            ),
        ),
        migrations.AddField(
            model_name="history",
            name="user",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
