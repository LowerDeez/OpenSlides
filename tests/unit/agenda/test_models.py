from unittest import TestCase
from unittest.mock import patch

from openslides.agenda.models import Item


class TestItemTitle(TestCase):
    @patch("openslides.agenda.models.Item.content_object")
    def test_title_from_content_object(self, content_object):
        item = Item()
        content_object.get_agenda_title.return_value = "related_title"

        self.assertEqual(item.title, "related_title")

    @patch("openslides.agenda.models.Item.content_object")
    def test_title_invalid_related(self, content_object):
        item = Item()
        content_object.get_agenda_title.return_value = "related_title"
        del content_object.get_agenda_title

        with self.assertRaises(NotImplementedError):
            item.title
